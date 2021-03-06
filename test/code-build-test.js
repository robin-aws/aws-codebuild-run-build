// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const {
  logName,
  inputs2Parameters,
  waitForBuildEndTime
} = require("../code-build");
const { expect } = require("chai");

describe("logName", () => {
  it("return the logGroupName and logStreamName from an ARN", () => {
    const arn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";
    const test = logName(arn);
    expect(test)
      .to.haveOwnProperty("logGroupName")
      .and.to.equal("/aws/codebuild/CloudWatchLogGroup");
    expect(test)
      .to.haveOwnProperty("logStreamName")
      .and.to.equal("1234abcd-12ab-34cd-56ef-1234567890ab");
  });

  it("return undefined when the group and stream are null", () => {
    const arn =
      "arn:aws:logs:us-west-2:111122223333:log-group:null:log-stream:null";
    const test = logName(arn);
    expect(test)
      .to.haveOwnProperty("logGroupName")
      .and.to.equal(undefined);
    expect(test)
      .to.haveOwnProperty("logStreamName")
      .and.to.equal(undefined);
  });
});

describe("inputs2Parameters", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  const projectName = "project_name";
  const repoInfo = "owner/repo";
  const sha = "1234abcd-12ab-34cd-56ef-1234567890ab";

  it("build basic parameters for codeBuild.startBuild", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;
    const test = inputs2Parameters();
    expect(test)
      .to.haveOwnProperty("projectName")
      .and.to.equal(projectName);
    expect(test)
      .to.haveOwnProperty("sourceVersion")
      .and.to.equal(sha);
    expect(test)
      .to.haveOwnProperty("sourceTypeOverride")
      .and.to.equal("GITHUB");
    expect(test)
      .to.haveOwnProperty("sourceLocationOverride")
      .and.to.equal(`https://github.com/owner/repo.git`);
    expect(test)
      .to.haveOwnProperty("buildspecOverride")
      .and.to.equal(undefined);

    // I send everything that starts 'GITHUB_'
    expect(test)
      .to.haveOwnProperty("environmentVariablesOverride")
      .and.to.have.lengthOf(2);
    expect(test.environmentVariablesOverride[0])
      .to.haveOwnProperty("name")
      .and.to.equal("GITHUB_REPOSITORY");
    expect(test.environmentVariablesOverride[0])
      .to.haveOwnProperty("value")
      .and.to.equal(repoInfo);
    expect(test.environmentVariablesOverride[0])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    expect(test.environmentVariablesOverride[1])
      .to.haveOwnProperty("name")
      .and.to.equal("GITHUB_SHA");
    expect(test.environmentVariablesOverride[1])
      .to.haveOwnProperty("value")
      .and.to.equal(sha);
    expect(test.environmentVariablesOverride[1])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");
  });

  it("a project name is required.", () => {
    expect(() => inputs2Parameters()).to.throw();
  });

  it("can send env-passthrough", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;

    process.env[`INPUT_ENV-PASSTHROUGH`] = `one, two 
    , three,
    four    `;

    process.env.one = "_one_";
    process.env.two = "_two_";
    process.env.three = "_three_";
    process.env.four = "_four_";

    const test = inputs2Parameters();

    expect(test)
      .to.haveOwnProperty("environmentVariablesOverride")
      .and.to.have.lengthOf(6);

    expect(test.environmentVariablesOverride[2])
      .to.haveOwnProperty("name")
      .and.to.equal("one");
    expect(test.environmentVariablesOverride[2])
      .to.haveOwnProperty("value")
      .and.to.equal("_one_");
    expect(test.environmentVariablesOverride[2])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    expect(test.environmentVariablesOverride[3])
      .to.haveOwnProperty("name")
      .and.to.equal("two");
    expect(test.environmentVariablesOverride[3])
      .to.haveOwnProperty("value")
      .and.to.equal("_two_");
    expect(test.environmentVariablesOverride[3])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    expect(test.environmentVariablesOverride[4])
      .to.haveOwnProperty("name")
      .and.to.equal("three");
    expect(test.environmentVariablesOverride[4])
      .to.haveOwnProperty("value")
      .and.to.equal("_three_");
    expect(test.environmentVariablesOverride[4])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    expect(test.environmentVariablesOverride[5])
      .to.haveOwnProperty("name")
      .and.to.equal("four");
    expect(test.environmentVariablesOverride[5])
      .to.haveOwnProperty("value")
      .and.to.equal("_four_");
    expect(test.environmentVariablesOverride[5])
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");
  });
});

describe("waitForBuildEndTime", () => {
  it("basic usages", async () => {
    let count = 0;
    const buildID = "buildID";
    const cloudWatchLogsArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";

    const buildReplies = [
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      }
    ];
    const logReplies = [{ events: [] }];
    const sdk = help(
      () => buildReplies[count++],
      () => logReplies[count - 1]
    );

    const test = await waitForBuildEndTime(sdk, {
      id: buildID,
      logs: { cloudWatchLogsArn }
    });

    expect(test).to.equal(buildReplies.pop().builds[0]);
  });

  it("waits for a build endTime **and** no cloud watch log events", async function() {
    this.timeout(25000);
    let count = 0;
    const buildID = "buildID";
    const nullArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:null:log-stream:null";
    const cloudWatchLogsArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";

    const buildReplies = [
      { builds: [{ id: buildID, logs: { cloudWatchLogsArn } }] },
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      },
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      }
    ];
    const logReplies = [
      undefined,
      { events: [{ message: "got one" }] },
      { events: [] }
    ];
    const sdk = help(
      () => buildReplies[count++],
      () => logReplies[count - 1]
    );

    const test = await waitForBuildEndTime(sdk, {
      id: buildID,
      logs: { cloudWatchLogsArn: nullArn }
    });
    expect(test).to.equal(buildReplies.pop().builds[0]);
  });
});

function help(builds, logs) {
  const codeBuild = {
    batchGetBuilds() {
      return {
        async promise() {
          return ret(builds);
        }
      };
    }
  };

  const cloudWatchLogs = {
    getLogEvents() {
      return {
        async promise() {
          return ret(logs);
        }
      };
    }
  };

  return { codeBuild, cloudWatchLogs, wait: 10 };

  function ret(thing) {
    if (typeof thing === "function") return thing();
    return thing;
  }
}
