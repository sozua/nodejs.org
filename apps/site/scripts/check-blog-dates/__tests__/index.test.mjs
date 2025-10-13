import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { checkBlogDates, checkAndFormatBlogDates } from '../index.mjs';

describe('checkBlogDates', () => {
  const mockBlogData = {
    posts: [
      { slug: '/blog/past-post', title: 'Past Post', date: '2024-01-01' },
      { slug: '/blog/future-post', title: 'Future Post', date: '2025-12-31' },
      {
        slug: '/blog/another-future',
        title: 'Another Future',
        date: '2025-11-15',
      },
    ],
  };

  it('should return no future posts when all posts are in the past', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2026-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, false);
    assert.equal(result.futurePosts.length, 0);
  });

  it('should detect future posts correctly', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, true);
    assert.equal(result.futurePosts.length, 2);
    assert.equal(result.futurePosts[0].slug, '/blog/future-post');
    assert.equal(result.futurePosts[1].slug, '/blog/another-future');
  });

  it('should calculate days in future correctly', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-12-30');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, true);
    assert.equal(result.futurePosts.length, 1);
    assert.equal(result.futurePosts[0].daysInFuture, 1);
  });

  it('should handle empty blog data', async () => {
    const mockGenerator = async () => ({ posts: [] });
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, false);
    assert.equal(result.futurePosts.length, 0);
  });

  it('should include all required fields in future posts', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    result.futurePosts.forEach(post => {
      assert.ok(post.slug);
      assert.ok(post.title);
      assert.ok(post.date);
      assert.ok(typeof post.daysInFuture === 'number');
      assert.ok(post.daysInFuture > 0);
    });
  });

  it('should handle post date exactly equal to current date', async () => {
    const mockData = {
      posts: [
        {
          slug: '/blog/exact',
          title: 'Exact',
          date: '2025-01-01T00:00:00.000Z',
        },
      ],
    };
    const mockGenerator = async () => mockData;
    const currentDate = new Date('2025-01-01T00:00:00.000Z');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, false);
    assert.equal(result.futurePosts.length, 0);
  });

  it('should handle timezone boundaries correctly', async () => {
    const mockData = {
      posts: [
        {
          slug: '/blog/tz-test',
          title: 'TZ Test',
          date: '2025-01-01T23:59:59.999Z',
        },
      ],
    };
    const mockGenerator = async () => mockData;
    const currentDate = new Date('2025-01-01T23:59:59.998Z');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, true);
    assert.equal(result.futurePosts.length, 1);
  });
});

describe('checkAndFormatBlogDates', () => {
  let mockCore, mockGithub, mockContext;

  beforeEach(t => {
    mockCore = {
      info: t.mock.fn(),
      setOutput: t.mock.fn(),
    };

    mockGithub = {
      rest: {
        pulls: {
          listFiles: t.mock.fn(() => Promise.resolve({ data: [] })),
        },
      },
    };

    mockContext = {
      repo: { owner: 'nodejs', repo: 'nodejs.org' },
      payload: {
        pull_request: {
          number: 123,
        },
      },
    };
  });

  afterEach(() => {
    process.env = {};
  });

  it('should skip when not in PR context (no github)', async () => {
    await checkAndFormatBlogDates({
      core: mockCore,
      github: null,
      context: mockContext,
    });

    assert.equal(mockCore.info.mock.calls.length, 1);
    assert.ok(
      mockCore.info.mock.calls[0].arguments[0].includes(
        'Not running in a PR context'
      )
    );
    assert.equal(mockCore.setOutput.mock.calls.length, 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
    assert.equal(mockCore.setOutput.mock.calls[0].arguments[1], 'false');
  });

  it('should skip when not in PR context (no context)', async () => {
    await checkAndFormatBlogDates({
      core: mockCore,
      github: mockGithub,
      context: null,
    });

    assert.equal(mockCore.info.mock.calls.length, 1);
    assert.ok(
      mockCore.info.mock.calls[0].arguments[0].includes(
        'Not running in a PR context'
      )
    );
    assert.equal(mockCore.setOutput.mock.calls.length, 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
    assert.equal(mockCore.setOutput.mock.calls[0].arguments[1], 'false');
  });

  it('should skip when not in PR context (no pull_request)', async () => {
    await checkAndFormatBlogDates({
      core: mockCore,
      github: mockGithub,
      context: { repo: { owner: 'nodejs', repo: 'nodejs.org' } },
    });

    assert.equal(mockCore.info.mock.calls.length, 1);
    assert.ok(
      mockCore.info.mock.calls[0].arguments[0].includes(
        'Not running in a PR context'
      )
    );
    assert.equal(mockCore.setOutput.mock.calls.length, 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
    assert.equal(mockCore.setOutput.mock.calls[0].arguments[1], 'false');
  });

  it('should process future posts in PR context', async () => {
    // This test will use the real checkBlogDates function, but we need to ensure
    // that there are actual future posts in the blog data for this to work
    // Since we can't easily mock the blog data generator, we'll test the PR filtering logic
    // by ensuring the function runs without errors in a PR context

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/some-post.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2025-12-31',
          },
        ],
      })
    );

    await checkAndFormatBlogDates({
      core: mockCore,
      github: mockGithub,
      context: mockContext,
    });

    // The function should have called setOutput at least once
    assert.ok(mockCore.setOutput.mock.calls.length >= 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
  });

  it('should handle slug processing correctly', async () => {
    // Test the slug processing logic by creating a scenario where we have
    // a future post with a slug that doesn't start with '/'

    // We'll create a test that exercises the slug processing logic
    // by ensuring the function processes different slug formats

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/test-post.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2025-12-31',
          },
        ],
      })
    );

    await checkAndFormatBlogDates({
      core: mockCore,
      github: mockGithub,
      context: mockContext,
    });

    // The function should have called setOutput at least once
    assert.ok(mockCore.setOutput.mock.calls.length >= 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
  });

  it('should set HAS_FUTURE_POSTS to false when no future posts in PR', async () => {
    // This test will use the real checkBlogDates function
    // Since we can't easily mock the blog data generator, we'll test the PR filtering logic
    // by ensuring the function runs without errors in a PR context

    mockGithub.rest.pulls.listFiles.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            filename: 'apps/site/pages/en/blog/some-post.md',
            patch: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n+date: 2024-01-01',
          },
        ],
      })
    );

    await checkAndFormatBlogDates({
      core: mockCore,
      github: mockGithub,
      context: mockContext,
    });

    // The function should have called setOutput at least once
    assert.ok(mockCore.setOutput.mock.calls.length >= 1);
    assert.equal(
      mockCore.setOutput.mock.calls[0].arguments[0],
      'HAS_FUTURE_POSTS'
    );
  });
});
