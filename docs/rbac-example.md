# RBAC example

Protect an administrator-only route with the generated auth object:

```ts
app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
});
```

`requireAdmin` verifies the request identity and checks `role: "admin"`. Applications still need business-level and object-level authorization for their own resources.

[Back to the documentation index](../README.md#documentation)
