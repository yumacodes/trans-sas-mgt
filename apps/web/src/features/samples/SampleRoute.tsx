import SamplePage from './SamplePage';
import { SAMPLE_CONFIGS } from './sampleData';

/**
 * Resolves a module page by id. The layout is shared, but no rows are passed in: these
 * modules have no backend yet, so they show empty tables and zero totals, never invented data.
 */
export default function SampleRoute({ id }: { id: string }) {
  const config = SAMPLE_CONFIGS[id];
  if (!config) throw new Error(`No page configured for ${id}`);
  return <SamplePage config={{ ...config, rows: [] }} />;
}
