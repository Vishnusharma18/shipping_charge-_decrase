# ecomwithnabeel Target Shipping Optimizer — V8

Target-based Meesho image optimizer.

- Upload one product image.
- Set minimum and optional maximum shipping.
- No manual variation/style selectors.
- Former six style controls are applied automatically across generated candidates: gradient background, random border, random size, white background, emoji overlay, and sale badge.
- Candidates are generated in internal parallel batches and tested sequentially on the Meesho supplier catalog page.
- Testing stops immediately when displayed shipping is inside the target range, then that candidate is uploaded.
- Actual Meesho displayed shipping remains the decision signal.
