# Approving a team licence refund voids its unredeemed Coupons; a claimed seat blocks approval

A team buyer can raise a Refund Request on a licence purchase as long as none of its Coupons has been redeemed. Approving that request voids every unredeemed Coupon on the purchase, so we don't return the money and still hand out seats. The rule that a claimed team seat can't be refunded is only checked when the request is raised. A Coupon can still be redeemed while the request is Open. So the rule is checked again at decision time: if any seat on the licence has been claimed since, approval is blocked and the Admin can only decline.

## Consequences

- The "claimed seat" check exists in two places, when the request is raised and when it is approved. Both have to agree on what "claimed" means.
