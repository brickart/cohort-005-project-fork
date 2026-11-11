# Notifications go through a transactional outbox

The domain function that changes the data decides which Notifications it causes, and writes them as rows in an outbox table inside its own transaction. A drainer in the app server delivers them to Knock after commit: it is kicked right after the response, and it also sweeps at boot and about once a minute. So a Notification is never lost when the change commits, and never sent when it rolls back. The user's action also never waits on Knock or fails because of it. We could have called Knock in the route action instead, but better-sqlite3 transactions are synchronous, a new Knock connection took about 7 s in the prototype, and any failure after commit would lose the Notification. Firing and forgetting after commit is fast but loses Notifications on a crash or a Knock outage.

## Consequences

- Delivery is at-least-once. Each trigger sends the outbox row's `idempotency_key`, a UUID generated at enqueue, as Knock's `Idempotency-Key`. It isn't the row id, because ids restart after a DB reset and Knock would drop the reused key as a duplicate, which Knock deduplicates for 24 hours. Retries (1 min, 5 min, 30 min, 2 h, 12 h, then `failed`) stay inside that window, so a retry never sends twice.
- Network errors, 5xx and 429 are retried. Any other 4xx fails at once.
- The rule that nobody is notified about their own action is applied once, at enqueue.
- Dev and tests run the same outbox and drainer. Only the transport changes: a local `NotificationService` with no credentials.
- Triggers whose writes live in route actions have to move into `app/lib` domain functions before they can enqueue.
