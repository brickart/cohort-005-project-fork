# Course Platform

A platform where learners buy and take video courses. This glossary fixes the words we use for its domain concepts, so code, UI copy, emails and docs all say the same thing.

## Language

### People and purchases

**Learner**:
A person who buys and takes courses on the platform.
_Avoid_: Customer, buyer, student (outside the `UserRole` value)

**Purchase**:
A learner's payment for one course, recording the amount they actually paid.
_Avoid_: Order, transaction

**Team Seat**:
One course place bought as part of a team licence, which a team member claims with a code.
_Avoid_: Coupon (in prose), licence slot

### Refunds

**Refund**:
A learner's request to get their money back for a Purchase, and the outcome of that request. A Purchase has at most one Refund.
_Avoid_: Reversal, Chargeback, Cancellation, "Cancel my purchase"

**Refund Amount**:
The money a Refund returns, which is always the amount the learner actually paid for the Purchase.
_Avoid_: Refundable amount, list price

**Refund Window**:
The period after a Purchase during which the learner can still request a Refund.
_Avoid_: Cancel window, cancellation period

**Requested**:
A Refund that the learner has submitted and nobody has resolved yet.
_Avoid_: Pending, open, "waiting on us"

**Approved**:
A Refund that someone accepted, so the Refund Amount goes back to the learner.

**Declined**:
A Refund that someone rejected. It is final: the learner cannot request another Refund for that Purchase.
