# Progress is kept when a refund ends an Enrollment

When an Approved Refund Request ends an Enrollment, the learner's Progress (lessons completed and video watched) is not deleted. It stays hidden while they aren't enrolled and comes back if they buy the course again. Deleting it can't be undone. The data is also the evidence for why the request was approved, if the learner disputes it later. And because watch time carries over to a new purchase, it counts towards the 2-hour limit on any later Refund Request, which stops "buy, watch, refund, repeat" without a separate rule.

## Considered Options

- **Delete Progress on approval**: rejected because it can't be undone, it destroys the evidence, and it would reset the watch limit for repeat refunds.
- **Keep Progress and still show it to the learner as a read-only record**: rejected because a learner who has been refunded shouldn't see the course as theirs.

## Consequences

- Never add code that clears Progress as part of a refund. The rule against repeat refunds depends on it surviving.
