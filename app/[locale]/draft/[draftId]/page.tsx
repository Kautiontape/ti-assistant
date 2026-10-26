import DraftApp from "../../../../src/fork/draft/DraftApp";

export default async function Page({ params }: PageProps<"/[locale]/draft/[draftId]">) {
  const { draftId } = await params;
  return <DraftApp id={draftId} />;
}
