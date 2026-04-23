## GOOD boundary example: Java class kept together as a single chunk

Input source (lines 1-32):

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

Correct chunking output:

```json
{
  "chunks": [
    {
      "startLine": 1,
      "endLine": 30,
      "summary": "Handles order lifecycle including creation validation and status transitions. Coordinates between the order repository and payment gateway to manage orders from cart to fulfillment."
    }
  ]
}
```

Why this is correct: The entire `OrderService` class — constructor, `createOrder`, `updateStatus`, and the private helper `validateCart` — forms a single cohesive unit. Splitting it would orphan methods from their class context.
