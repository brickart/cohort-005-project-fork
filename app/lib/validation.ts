import { data } from "react-router";
import { z } from "zod";

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = {
  success: false;
  errors: Record<string, string>;
};
type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/**
 * Converts FormData to a plain object, validates with a Zod schema,
 * and returns either the parsed data or a field-error map (first error per field).
 */
export function parseFormData<T extends z.ZodType>(
  formData: FormData,
  schema: T
): ParseResult<z.infer<T>> {
  const raw = Object.fromEntries(formData);
  const result = schema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[key] = messages[0];
    }
  }

  return { success: false, errors };
}

/**
 * A database id from a route param or a form field. `Number("")` is 0, so an
 * empty or malformed id fails here instead of reaching a query.
 */
export const idParam = z.coerce.number().int().positive();

/**
 * Validates route params with a Zod schema.
 * Throws a 400 response on failure (params are never user-correctable form errors).
 * Pass `notFound` to throw a 404 with that message instead, for a route that
 * treats a malformed id like a missing row.
 */
export function parseParams<T extends z.ZodType>(
  params: Record<string, string | undefined>,
  schema: T,
  { notFound }: { notFound?: string } = {}
): z.infer<T> {
  const result = schema.safeParse(params);

  if (result.success) {
    return result.data;
  }

  if (notFound !== undefined) throw data(notFound, { status: 404 });
  throw data("Invalid parameters", { status: 400 });
}

/**
 * Parses a JSON request body with a Zod schema.
 * Returns either the parsed data or a field-error map (first error per field).
 */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParseResult<z.infer<T>>> {
  const raw = await request.json();
  const result = schema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[key] = messages[0];
    }
  }

  return { success: false, errors };
}
