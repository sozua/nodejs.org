import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
  createReviewForFutureDates,
  buildCommentBody,
  BOT_USER_LOGIN,
  BOT_PREFIX,
} from '../create-review.mjs';

describe('createReviewForFutureDates', () => {
  let mockGithub, mockContext, mockCore;

  beforeEach(t => {
    process.env = {};

    mockGithub = {
      rest: {
        pulls: {
          createReview: t.mock.fn(),
          listFiles: t.mock.fn(() => Promise.resolve({ data: [] })),
          listReviewComments: t.mock.fn(() => Promise.resolve({ data: [] })),
          updateReviewComment: t.mock.fn(),
        },
      },
    };

    mockContext = {
      repo: { owner: 'nodejs', repo: 'nodejs.org' },
      issue: { number: 123 },
      payload: {
        pull_request: {
          head: { sha: 'abc123' },
        },
      },
    };

    mockCore = {
      info: t.mock.fn(),
      warning: t.mock.fn(),
    };
  });

  afterEach(() => {
    process.env = {};
  });

  it('should skip when no future posts in env', async () => {
    delete process.env.FUTURE_POSTS_JSON;

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.listFiles.mock.calls.length, 0);
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
    assert.equal(mockCore.info.mock.calls.length, 1);
  });

  it('should create review with inline comments for new posts', async () => {
    const MOCK_DATE = '2099-01-01T00:00:00.000Z';
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: MOCK_DATE,
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);

    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    assert.equal(createCall.pull_number, 123);
    assert.equal(createCall.event, 'COMMENT');
    assert.equal(createCall.comments.length, 1);
    assert.equal(
      createCall.comments[0].path,
      'apps/site/pages/en/blog/test.md'
    );
    assert.ok(createCall.comments[0].body.includes(MOCK_DATE));
  });

  it('should warn when file is not in PR diff', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({ data: [] })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes(
        'not found in PR diff'
      )
    );
  });

  it('should warn when date line is not found in patch', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+title: Test',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes('Could not find')
    );
  });

  it('should update existing bot comment when content changes', async () => {
    const OLD_DATE = '2098-01-01T00:00:00.000Z';
    const NEW_DATE = '2099-01-01T00:00:00.000Z';

    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: NEW_DATE,
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listReviewComments.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 456,
            path: 'apps/site/pages/en/blog/test.md',
            user: { login: BOT_USER_LOGIN },
            body: `${BOT_PREFIX} ${OLD_DATE}\n\nThis post is scheduled 50 days in the future. Make sure this date is correct.`,
          },
        ],
      })
    );

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(
      mockGithub.rest.pulls.updateReviewComment.mock.calls.length,
      1
    );
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);

    const updateCall =
      mockGithub.rest.pulls.updateReviewComment.mock.calls[0].arguments[0];
    assert.equal(updateCall.comment_id, 456);
    assert.ok(updateCall.body.includes(NEW_DATE));
    assert.ok(updateCall.body.includes('100 days'));
  });

  it('should not update existing bot comment when content is identical', async () => {
    const MOCK_DATE = '2099-01-01T00:00:00.000Z';

    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: MOCK_DATE,
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listReviewComments.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 456,
            path: 'apps/site/pages/en/blog/test.md',
            user: { login: BOT_USER_LOGIN },
            body: `${BOT_PREFIX} ${MOCK_DATE}\n\nThis post is scheduled 100 days in the future. Make sure this date is correct.`,
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(
      mockGithub.rest.pulls.updateReviewComment.mock.calls.length,
      0
    );
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
  });

  it('should handle update failure gracefully', async () => {
    const NEW_DATE = '2099-01-01T00:00:00.000Z';

    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: NEW_DATE,
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listReviewComments.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 456,
            path: 'apps/site/pages/en/blog/test.md',
            user: { login: BOT_USER_LOGIN },
            body: `${BOT_PREFIX} OLD_DATE\n\nOld content`,
          },
        ],
      })
    );

    mockGithub.rest.pulls.updateReviewComment.mock.mockImplementation(() =>
      Promise.reject(new Error('API Error'))
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(
      mockGithub.rest.pulls.updateReviewComment.mock.calls.length,
      1
    );
    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes('Failed to update')
    );
  });

  it('should create review with multiple inline comments for multiple posts', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/post-1',
        title: 'Post 1',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
      {
        slug: '/blog/post-2',
        title: 'Post 2',
        date: '2099-02-01T00:00:00.000Z',
        daysInFuture: 131,
      },
      {
        slug: '/blog/post-3',
        title: 'Post 3',
        date: '2099-03-01T00:00:00.000Z',
        daysInFuture: 159,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/post-1.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
          {
            filename: 'apps/site/pages/en/blog/post-2.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-02-01',
          },
          {
            filename: 'apps/site/pages/en/blog/post-3.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-03-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);

    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    assert.equal(createCall.comments.length, 3);
    assert.equal(
      createCall.comments[0].path,
      'apps/site/pages/en/blog/post-1.md'
    );
    assert.equal(
      createCall.comments[1].path,
      'apps/site/pages/en/blog/post-2.md'
    );
    assert.equal(
      createCall.comments[2].path,
      'apps/site/pages/en/blog/post-3.md'
    );
    assert.ok(createCall.comments[0].body.includes('100 days'));
    assert.ok(createCall.comments[1].body.includes('131 days'));
    assert.ok(createCall.comments[2].body.includes('159 days'));
  });

  it('should handle mixed scenarios with some files not in PR', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/in-pr',
        title: 'In PR',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
      {
        slug: '/blog/not-in-pr',
        title: 'Not in PR',
        date: '2099-02-01T00:00:00.000Z',
        daysInFuture: 131,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/in-pr.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    assert.equal(createCall.comments.length, 1);
    assert.equal(
      createCall.comments[0].path,
      'apps/site/pages/en/blog/in-pr.md'
    );

    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes('not-in-pr')
    );
  });

  it('should handle file with undefined patch', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: undefined,
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes(
        'not found in PR diff'
      )
    );
  });

  it('should handle multiple date: fields and find first one', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch:
              '--- a/file\n+++ b/file\n@@ -1,5 +1,5 @@\n+date: 2099-01-01\n+publishDate: 2099-01-02',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    // Should comment on the first date: field (line 4 in the patch)
    assert.equal(createCall.comments[0].position, 4);
  });

  it('should handle date: in removed lines gracefully', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch:
              '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n-date: 2098-01-01\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    // Should find a date: line (either the removed or added one)
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
  });

  it('should handle empty FUTURE_POSTS_JSON array', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([]);

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.listFiles.mock.calls.length, 1);
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
  });

  it('should handle review creation failure gracefully', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    mockGithub.rest.pulls.createReview.mock.mockImplementation(() =>
      Promise.reject(new Error('GitHub API Error'))
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
    assert.equal(mockCore.warning.mock.calls.length, 1);
    assert.ok(
      mockCore.warning.mock.calls[0].arguments[0].includes(
        'Failed to create review'
      )
    );
  });

  it('should throw error for malformed FUTURE_POSTS_JSON', async () => {
    process.env.FUTURE_POSTS_JSON = 'invalid json {';

    await assert.rejects(
      async () => {
        await createReviewForFutureDates({
          github: mockGithub,
          context: mockContext,
          core: mockCore,
        });
      },
      {
        name: 'SyntaxError',
      }
    );
  });

  it('should skip non-bot comments when looking for existing comments', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    // Existing comment from a human user, not bot
    mockGithub.rest.pulls.listReviewComments.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 789,
            path: 'apps/site/pages/en/blog/test.md',
            user: { login: 'human-user' },
            body: `${BOT_PREFIX} some comment`,
          },
        ],
      })
    );

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    // Should create new comment, not update human's comment
    assert.equal(
      mockGithub.rest.pulls.updateReviewComment.mock.calls.length,
      0
    );
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
  });

  it('should skip bot comments without the BOT_PREFIX', async () => {
    process.env.FUTURE_POSTS_JSON = JSON.stringify([
      {
        slug: '/blog/test',
        title: 'Test Post',
        date: '2099-01-01T00:00:00.000Z',
        daysInFuture: 100,
      },
    ]);

    // Bot comment but without the prefix
    mockGithub.rest.pulls.listReviewComments.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 789,
            path: 'apps/site/pages/en/blog/test.md',
            user: { login: BOT_USER_LOGIN },
            body: 'Some other bot comment without the prefix',
          },
        ],
      })
    );

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2099-01-01',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    // Should create new comment, not update the bot's other comment
    assert.equal(
      mockGithub.rest.pulls.updateReviewComment.mock.calls.length,
      0
    );
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);
  });
});

describe('buildCommentBody', () => {
  it('should format comment with date and days in future', () => {
    const post = {
      date: '2099-01-15T00:00:00.000Z',
      daysInFuture: 42,
    };

    const result = buildCommentBody(post);

    assert.ok(result.includes(BOT_PREFIX));
    assert.ok(result.includes('2099-01-15T00:00:00.000Z'));
    assert.ok(result.includes('42 days in the future'));
    assert.ok(result.includes('Make sure this date is correct'));
  });

  it('should handle singular day correctly', () => {
    const post = {
      date: '2099-01-01T00:00:00.000Z',
      daysInFuture: 1,
    };

    const result = buildCommentBody(post);

    assert.ok(result.includes('1 day in the future'));
    assert.ok(!result.includes('1 days'));
  });

  it('should handle large number of days', () => {
    const post = {
      date: '2100-12-31T00:00:00.000Z',
      daysInFuture: 27500,
    };

    const result = buildCommentBody(post);

    assert.ok(result.includes('27500 days in the future'));
  });
});
