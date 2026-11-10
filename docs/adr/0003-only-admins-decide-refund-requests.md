# Only Admins decide Refund Requests, and eligibility limits are guidance at decision time

Only users with the Admin role can approve or decline a Refund Request. A course's own instructor cannot, even though `requireStaff` treats instructors and Admins alike everywhere else. A Refund is a money decision, and the instructor has a conflict of interest.

The eligibility limits (14-day window, 2 hours watched, 50% of lessons completed) only control whether a learner can *raise* a request. The learner keeps watching while the request is Open, so by the time an Admin looks they may be over a limit. The Admin sees current Progress against each limit, with any that are over flagged, and can still approve. We treat the 50% completion rule as a real rule, even though at first only the course page enforced it and the refund action didn't.

When two Admins decide the same request, the first decision wins. A request can only be decided while it is still Open.

## Considered Options

- **Let the owning instructor decide too**: rejected because of the conflict of interest.
- **Re-check the limits at approval and block if any is exceeded**: rejected because it would punish the learner for using a course they still had access to while waiting for review.
