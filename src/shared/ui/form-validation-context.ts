import { createContext } from "react";

export type FormValidator = () => boolean;

export interface FormValidationRegistry {
  register(validator: FormValidator): () => void;
}

export const FormValidationContext = createContext<FormValidationRegistry | null>(null);
