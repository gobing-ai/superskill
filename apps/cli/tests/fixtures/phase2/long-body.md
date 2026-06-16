---
name: verbose-skill
description: A skill with excessively long body content for testing conciseness scoring
---

## Overview
This skill has an extremely long body that goes on and on for hundreds of words to test how the conciseness dimension scores very verbose content. The text here is intentionally padded to ensure it exceeds the typical sweet spot for content length scoring. We keep adding more and more content to push the score toward the lower end of the conciseness range.

## Section One
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## Section Two
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

## Section Three
Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

## Section Four
Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.

## Section Five
At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.

## Section Six
Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.

## Section Seven
Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. This body continues to add content to ensure it is long enough for conciseness dimension testing purposes. The more text we add, the lower the conciseness score should become, demonstrating that the scoring heuristic correctly penalizes unnecessarily verbose content.

## Section Eight
This additional block deliberately repeats operational guidance in a slow and expansive style so the fixture crosses the long-form threshold used by the Phase 2 tests. A concise skill would state the action, name the expected inputs, and describe the output contract once. This fixture instead elaborates on the same point with many extra sentences, showing how unnecessary repetition can make content harder to scan. The evaluator should see that the document is not merely detailed but verbose. The point is not to model excellent technical writing. The point is to create a stable sample where the body length is clearly outside the compact range.

## Section Nine
When a skill asks an agent to inspect files, it should usually identify the exact files or selection criteria, then describe the next decision. This sample says that in a long way. The agent should read the project instructions, read the related task, inspect the changed source, inspect the tests, compare the requirements, record findings, fix the highest priority issue, run the verification command, and update the task status. The same flow could be summarized in a short checklist, but this fixture keeps expanding each clause to create enough words for conciseness scoring. It also repeats that the sample is intentionally excessive so the expected evaluation result remains predictable across minor scoring changes.

## Section Ten
Another verbose paragraph follows with the same intention. The document explains that output should avoid unrelated narration, but it does so while producing unrelated narration. It explains that tests should avoid coupling to private implementation details, while still spending multiple sentences restating the obvious relationship between requirements and assertions. It explains that store tests should cover successful writes, failed writes, filtering behavior, ordering behavior, serialization behavior, and update behavior. These are useful cases, but listing them repeatedly makes the document longer than a practical skill definition would need to be.

## Section Eleven
The fixture continues to describe ordinary verification work. A reviewer checks security, efficiency, correctness, and usability. A reviewer checks whether tests can fail for the intended reason. A reviewer checks whether command output is captured without leaking to the terminal. A reviewer checks whether fixtures are meaningful and small enough to maintain. A reviewer checks whether generated proposals and evaluations persist with stable timestamps. A reviewer checks whether the final command exits successfully. Each sentence is individually understandable, but together they create more volume than the task needs. That volume is the behavior under test.

## Section Twelve
The long body should remain deterministic, local, and dependency-free. It should not require network access, generated data, random content, or platform-specific shell behavior. It should be readable as ordinary Markdown so failing assertions can print useful snippets. It should also avoid sensitive data, real credentials, or paths outside the repository. The prose here is intentionally bland because the evaluator only needs length and structure. Rich semantics are not required. Repetition is acceptable in this fixture because repetition is precisely the property the conciseness score is meant to penalize.

## Section Thirteen
If this were a production skill, most of these paragraphs would be deleted. The final version would contain a short trigger rule, a short workflow, a clear verification gate, and a small set of examples. It would not explain the same workflow in several sections. It would not restate that long text is long. It would not include filler about filler. This test fixture does those things because the scoring path must receive an input that is unambiguously verbose. That makes the assertion less brittle than relying on borderline body length.

## Section Fourteen
The sample now has enough content to exercise the long-body branch without depending on external documents. The test can copy it, parse it, validate it, evaluate it, and compare the resulting score against the expected conciseness behavior. Future maintainers should preserve the rough size of this file when editing it. Reducing it below the documented threshold would weaken the Phase 2 fixture set and could make coverage claims inaccurate. Adding a few more sentences is safer than trimming aggressively because the purpose of this file is to be obviously, measurably, and intentionally overlong.
