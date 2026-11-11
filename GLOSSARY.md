# Cadence

Cadence sells video courses to learners. This glossary is Cadence's domain language: who takes part, how learning is measured, and how a learner gets their money back.

## Language

### People

**Learner**:
A person who buys and takes courses on Cadence.
_Avoid_: Student, User, Customer

**Instructor**:
A person who builds and owns courses, and sees the Learners enrolled on them.
_Avoid_: Teacher, Author, Creator

**Admin**:
The only person who may approve or decline a Refund Request. An Instructor cannot decide refunds on their own course.
_Avoid_: The team, Staff, Reviewer

### Learning

**Enrollment**:
A Learner's place on a course. It is the only thing that gives access to the course.

**Lapsed**:
A Learner on an Instructor's roster who no longer has an Enrollment on the course.

**Watched**:
Seconds of video a Learner has actually played in a course: the furthest point reached in each lesson, added up. Not lessons opened.
_Avoid_: Viewed

**Progress**:
A Learner's lessons completed and Watched time on a course. It is kept when their Enrollment ends.

### Refunds

**Refund Request**:
A Learner's ask, with their reason, to get back what they paid for a purchase. A purchase can have several over time, but only one Open at once.
_Avoid_: Refund (for the ask itself), Cancellation, Reversal, Chargeback

**Open Refund Request**:
A Refund Request no Admin has decided yet. The Learner keeps their Enrollment while it is open.
_Avoid_: Pending, Requested, Awaiting review

**Approved Refund Request**:
A Refund Request an Admin has accepted. Approving it ends the Learner's Enrollment and leads to a Refund.

**Declined Refund Request**:
A Refund Request an Admin has turned down. It has no Refund, and the Learner may raise a new one.

**Refund**:
The money returned to a Learner after their Refund Request is approved. It is always the full amount they paid.
_Avoid_: Reversal, Chargeback, Cancellation

**Watch Limit**:
A Learner can only raise a Refund Request on a course with under two hours Watched.
_Avoid_: Watch cap, Viewing threshold

### Notifications

**Notification**:
A message to one Learner, Instructor or Admin about something that happened on Cadence.
_Avoid_: Alert, Message, Email (for the notification itself)

**Channel**:
How a Notification reaches its person: Email, In-app or Browser.
_Avoid_: Medium, Transport

**Notification Preference**:
A person's on/off choice for one kind of Notification on one Channel.
_Avoid_: Subscription, Opt-out

**Mute**:
A switch, for all Channels or for one, that silences a person's Notifications without changing the Notification Preferences underneath.
_Avoid_: Do not disturb, Pause

**Locked Notification**:
A Notification on one Channel that ignores Mute and Notification Preferences because it answers something the person did. Only some Emails are locked.
_Avoid_: Mandatory, Transactional
