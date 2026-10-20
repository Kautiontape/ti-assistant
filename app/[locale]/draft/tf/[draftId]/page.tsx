import TfDraftApp from "../../../../../src/fork/tfdraft/TfDraftApp";

export default async function Page({ params }: PageProps<"/[locale]/draft/tf/[draftId]">) {
  const { draftId } = await params;
  return <TfDraftApp id={draftId} />;
}
