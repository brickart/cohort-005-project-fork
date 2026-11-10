# Approving a Refund Request records the Refund amount; the money side is out of scope

Approving a Refund Request sets the amount refunded to the full amount paid, along with who approved it and when. That records the decision as the glossary defines it (a Refund is always the full amount paid). Actually sending the money, and tracking whether it was sent or failed, are deliberately out of scope for the first version of admin refund review. A future reader shouldn't assume an approved request with an amount means money has moved.

## Consequences

- The `refunds` table holds both the Refund Request and the Refund. The glossary treats them as separate. That split is a known gap, to deal with when the money side is built.
