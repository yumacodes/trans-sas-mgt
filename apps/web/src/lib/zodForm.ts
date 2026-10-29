import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * zodResolver typed for schemas whose parsed output differs from their input (defaults,
 * transforms, coercion). Form fields use the input type; submit handlers get the output.
 */
export function zodForm<S extends z.ZodTypeAny>(schema: S): Resolver<z.input<S>, unknown, z.output<S>> {
  return zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>;
}
