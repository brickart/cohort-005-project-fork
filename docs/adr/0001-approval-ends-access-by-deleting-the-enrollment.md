# Approving a Refund Request ends access by deleting the Enrollment

Access to a course comes only from an Enrollment, so approving a Refund Request deletes the learner's Enrollment at the moment of approval. The learner keeps access while the request is Open, and buying the course again afterwards is allowed. We don't wait for the Refund to be Issued, because the money side is out of scope for now and we didn't want access to depend on it. We delete the Enrollment instead of marking it ended because the Approved Refund Request already records who approved it and when. Deleting also means every existing place that reads Enrollments (access checks, the instructor's student list, enrollment counts, analytics) is correct without any changes.

## Considered Options

- **Remove access when the Refund is Issued**: rejected because it ties access to Refund states we haven't built.
- **Remove access when the request is raised**: rejected because a learner whose request is declined would have lost access for nothing.
- **Never remove access**: rejected because the learner would get the money back and keep the course.
- **Mark the Enrollment ended instead of deleting it**: rejected because every Enrollment read would need a new filter, and the Approved Refund Request already holds the history.

## Consequences

- Refunded learners drop out of instructor student lists and enrollment counts.
- Nothing in the Enrollment table shows that someone was refunded. Look at the Refund Requests for that.
