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

## GOOD boundary example: Spring AOP @Aspect class kept as single chunk

Input source (lines 1-18):

```java
 1: @Aspect
 2: @Component
 3: public class AuditAspect {
 4:
 5:     @Around("execution(* com.example.service.*.*(..))")
 6:     public Object auditServiceCall(ProceedingJoinPoint jp) throws Throwable {
 7:         long start = System.currentTimeMillis();
 8:         Object result = jp.proceed();
 9:         long elapsed = System.currentTimeMillis() - start;
10:         log.info("Method {} took {}ms", jp.getSignature().getName(), elapsed);
11:         return result;
12:     }
13:
14:     @Before("@annotation(com.example.Auditable)")
15:     public void beforeAuditable(JoinPoint jp) {
16:         log.info("Entering auditable method: {}", jp.getSignature());
17:     }
18: }
```

Correct chunking output:

```json
{
  "chunks": [
    {
      "startLine": 1,
      "endLine": 18,
      "summary": "Implements AOP audit aspect that logs execution time for all service methods and records entry for @Auditable-annotated methods via Spring pointcut expressions"
    }
  ]
}
```

Why: The @Aspect class, its @Around and @Before advice, and the pointcut expressions form a single cross-cutting concern. Splitting advice methods into separate chunks loses the relationship between the aspect declaration and the join point interception logic.
