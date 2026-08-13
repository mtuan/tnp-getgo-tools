# Form UI Guidelines

- Use the shared schema-driven `Form` system and declarative `FormSchema` definitions for standard create/edit forms.
- Build labels, placeholders, hints, options, validation messages, and accessible names from locale values.
- Initialize state from the selected canonical record and reset it intentionally when the record or open session changes.
- Use the built-in field type matching the data. Add a reusable shared field type when an interaction occurs in multiple forms.
- Use schema rows and sections for intentional layouts; use `when` for conditional fields. Hidden fields must not be validated or submitted.
- Set intentional autofocus, normally the first editable field.
- Use `readOnly` for focusable/copyable values and `disabled` only when interaction must be blocked.
- Put reusable synchronous constraints in field rules. Services/repositories must still enforce domain and persistence rules.
- Preserve entered values after failure, expose errors clearly, and prevent duplicate submission.
- Custom fields must receive value, change handler, error, and disabled state from the form lifecycle.
- Every field must support keyboard/touch input, visible focus, light/dark themes, and longer English/Vietnamese text.
- Keep submitting state until persistence succeeds; close the editor only after success.
- For CRUD drawers/modals, submit through the form lifecycle and return the canonical persisted record to the caller. The caller must update its visible data in place before the editor closes; never use a page reload as form synchronization.
