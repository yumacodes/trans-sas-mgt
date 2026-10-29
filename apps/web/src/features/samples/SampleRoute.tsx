import SamplePage from './SamplePage';
import { SAMPLE_CONFIGS } from './sampleData';

/** Resolves a sample page by id, so the router never imports the data directly. */
export default function SampleRoute({ id }: { id: string }) {
  const config = SAMPLE_CONFIGS[id];
  if (!config) throw new Error(`No sample page configured for ${id}`);
  return <SamplePage config={config} />;
}
