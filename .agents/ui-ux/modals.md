# Modal, Drawer, Dropdown, and Overlay Guidelines

- Use shared compound modal/overlay primitives; do not create isolated page-specific overlay systems.
- Use a responsive editor placement, centered placement for focused tasks/decisions, and fullscreen only for immersive editors.
- Choose the smallest size that fits without cramped wrapping.
- Provide obvious localized close/cancel paths; preserve Escape, backdrop close, and focus restoration unless intentionally blocked.
- Trap focus inside modals and return it to the initiating control after close.
- Keep headers and footers usable while content scrolls.
- For CRUD editors, keep Delete alone on the left and Cancel plus Save/Create on the right. During save or confirmed delete, show the shared loading state and prevent backdrop, Escape, or repeated actions from interrupting the operation.
- Close a CRUD modal/drawer only after persistence succeeds and its caller has reconciled the returned canonical data in place. On failure, keep it open and preserve the form state.
- Render overlays and dropdown menus through a document-level portal so transformed ancestors and scroll containers cannot clip them or alter layout.
- Position portaled menus from their trigger and update placement on scroll/resize. Opening a menu must not change form height or scroll range.
- Avoid arbitrary z-index escalation and nested dialogs. Verify focus order, Escape behavior, overlay interaction, and stacking.
- Respect reduced motion and verify long translations, window resizing, and small displays.
