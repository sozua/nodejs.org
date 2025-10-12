import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { createReviewForFutureDates } from '../create-review.mjs';

describe('createReviewForFutureDates', () => {
  let mockGithub, mockContext, mockCore, originalEnv;

  beforeEach(t => {
    process.env = {};

    mockGithub = {
      rest: {
        pulls: {
          createReview: t.mock.fn(),
          listReviews: t.mock.fn(),
        },
      },
    };

    mockContext = {
      repo: { owner: 'nodejs', repo: 'nodejs.org' },
      issue: { number: 123 },
    };

    mockCore = {
      info: t.mock.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should skip when no future posts in env', async () => {
    delete process.env.FUTURE_POSTS;

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.listReviews.mock.calls.length, 0);
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
    assert.equal(mockCore.info.mock.calls.length, 1);
    assert.equal(
      mockCore.info.mock.calls[0].arguments[0],
      'No future posts found, skipping review creation'
    );
  });

  it('should create review when none exists', async () => {
    process.env.FUTURE_POSTS = `
    | Post | Title |
    |------|-------|
    | /blog/test | Test Post |
    `;

    mockGithub.rest.pulls.listReviews.mock.mockImplementation(() =>
      Promise.resolve({ data: [] })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.listReviews.mock.calls.length, 1);
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 1);

    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    assert.equal(createCall.owner, 'nodejs');
    assert.equal(createCall.repo, 'nodejs.org');
    assert.equal(createCall.pull_number, 123);
    assert.equal(createCall.event, 'REQUEST_CHANGES');
    assert.ok(createCall.body.includes('Future publish dates found'));
  });

  it('should skip when review already exists', async () => {
    process.env.FUTURE_POSTS = `
    | Post | Title |
    |------|-------|
    | /blog/test | Test Post |
    `;

    mockGithub.rest.pulls.listReviews.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            user: { login: 'github-actions[bot]' },
            state: 'CHANGES_REQUESTED',
            body: '**Future publish dates found:**',
          },
        ],
      })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    assert.equal(mockGithub.rest.pulls.listReviews.mock.calls.length, 1);
    assert.equal(mockGithub.rest.pulls.createReview.mock.calls.length, 0);
    assert.ok(
      mockCore.info.mock.calls.some(
        call => call.arguments[0] === 'Review already exists, skipping'
      )
    );
  });

  it('should create review if existing review is not from bot', async () => {
    process.env.FUTURE_POSTS =
      '| Post | Title |\n|------|-------|\n| /blog/test | Test Post |';

    mockGithub.rest.pulls.listReviews.mock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            user: { login: 'someuser' },
            state: 'CHANGES_REQUESTED',
            body: '**Future publish dates found:**',
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
  });

  it('should include future posts table in review body', async () => {
    const tableData = `
    | Post | Title | Date |
    |------|-------|------|
    | /blog/future | Future Post | 2099-01-01 |
    `;
    process.env.FUTURE_POSTS = tableData;

    mockGithub.rest.pulls.listReviews.mock.mockImplementation(() =>
      Promise.resolve({ data: [] })
    );

    await createReviewForFutureDates({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
    });

    const createCall =
      mockGithub.rest.pulls.createReview.mock.calls[0].arguments[0];
    assert.ok(createCall.body.includes(tableData));
    assert.ok(
      createCall.body.includes(
        'Posts will be published immediately when merged'
      )
    );
  });
});
