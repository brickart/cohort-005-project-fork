# Cadence

Cadence sells video courses to learners. This glossary covers the language around getting money back after a purchase, and what happens to the learner's access when they do.

## Language

### Refunds

**Refund Request**:
A learner's ask, with their reason, to get back what they paid for a purchase. An Admin approves or declines it. One purchase can have several Refund Requests over time, but only one can be undecided at once.
_Avoid_: Refund (for the ask itself), Cancellation, Reversal, Chargeback

**Open Refund Request**:
A Refund Request no Admin has decided yet. The learner keeps their Enrollment while it is open.
_Avoid_: Pending, Requested, Awaiting review

**Approved Refund Request**:
A Refund Request an Admin has accepted. Approving it is what leads to a Refund, and it ends the learner's Enrollment at that moment. On a team licence purchase it also voids every unredeemed Coupon.

**Declined Refund Request**:
A Refund Request an Admin has turned down. It has no Refund, and the learner may raise a new Refund Request.

**Admin**:
The only person who may approve or decline a Refund Request. A course's instructor cannot decide refunds on their own course.
_Avoid_: The team, Staff, Reviewer

**Refund**:
The money returned to a learner after their Refund Request is approved. It is always the full amount they paid. A declined Refund Request has no Refund.
_Avoid_: Reversal, Chargeback, Cancellation

**Pending Refund**:
A Refund the team has approved where the money hasn't been confirmed as sent yet.
_Avoid_: Pending (for a Refund Request awaiting review)

**Issued Refund**:
A Refund where the money has been confirmed as sent back to the learner.
_Avoid_: Completed, Paid out

**Failed Refund**:
A Refund where the money couldn't be sent. The Refund Request stays approved, because the decision hasn't changed.

### Other terms

**Watch Limit**:
A Refund is only offered on a course with under two hours watched. Past that, the Learner has had the course, and the refund form turns them away.
_Avoid_: Watch cap, Viewing threshold

**Refunds table**:
`refunds` — one row per Refund. Columns: `id`, `purchase_id`, `status` (`open`, `approved`, `declined`), `reason`, `amount_refunded`, `requested_at`, `resolved_at`, `resolved_by_user_id`, `decision_note`.

**refunded_at**:
Nullable text column on `coupons`. An ISO timestamp, set on every unclaimed coupon when its team purchase is refunded. `getSeatAvailability` returns `"refunded"` for it.

**resolved_by_user_id**:
Integer column on `refunds`, referencing `users.id`. Null until an Admin approves or declines the Refund.

**RefundRequestCard**:
The component that draws one Refund Request on `/admin/refunds`, with its Approve and Decline buttons.

**Button**:
A clickable element that fires an action when the user presses it. Built on `~/components/ui/button`.

**Component**:
A React function that returns JSX.

**cwd**:
The directory the dev server was started from. Paths in `scripts/` resolve from here.

**Loader**:
The React Router function that fetches a route's data on the server before the page renders.

**Slug**:
The URL-safe name of a course, as in `/courses/:slug`.

**Lapsed**:
An Enrollment that is no longer active. Shown as a badge on the instructor's student roster.

**Instructor**:
Speaks for their own courses only. An Instructor builds and edits the courses they own, and sees the learners enrolled on them.
_Avoid_: Teacher, Author, Creator

**Watched**:
Seconds of video a Learner has actually played in a course: the furthest point reached in each lesson, added up. Not lessons opened.
_Avoid_: Viewed, Progress
