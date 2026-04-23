## BAD boundary example: Java class split across chunks (avoid this)

Input source (lines 1-30) — same `OrderService` class:

```java
 1: public class OrderService {
 2:
 3:     private final OrderRepository repo;
 4:     private final PaymentGateway payments;
 5:
 6:     public OrderService(OrderRepository repo, PaymentGateway payments) {
 7:         this.repo = repo;
 8:         this.payments = payments;
 9:     }
10:
11:     public Order createOrder(Cart cart, Customer customer) {
12:         validateCart(cart);
13:         Order order = new Order(cart, customer);
14:         repo.save(order);
15:         return order;
16:     }
17:
18:     public void updateStatus(Long orderId, OrderStatus newStatus) {
19:         Order order = repo.findById(orderId)
20:             .orElseThrow(() -> new OrderNotFoundException(orderId));
21:         order.transitionTo(newStatus);
22:         repo.save(order);
23:     }
24:
25:     private void validateCart(Cart cart) {
26:         if (cart.isEmpty()) {
27:             throw new IllegalArgumentException("Cart must not be empty");
28:         }
29:     }
30: }
```

Incorrect chunking output (DO NOT do this):

```json
{
  "chunks": [
    {
      "startLine": 1,
      "endLine": 16,
      "summary": "OrderService class with constructor and createOrder method"
    },
    {
      "startLine": 17,
      "endLine": 30,
      "summary": "updateStatus and validateCart methods"
    }
  ]
}
```

Why this is wrong: method `updateStatus` is separated from its class. A retrieval system looking for "order status transitions" will find the second chunk without the class name, constructor, or sibling methods — losing all context about what service this belongs to. Keep the entire class as one chunk.
