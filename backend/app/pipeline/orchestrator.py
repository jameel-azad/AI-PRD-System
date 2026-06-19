from app.pipeline.graph import pipeline_graph


async def process_source_file(source_file_id: int) -> None:
    """Run the full processing pipeline for a single uploaded SourceFile.

    All 8 stages (load → transcribe → extract → generate PRD → gap analysis →
    score → save → error handling) are now graph nodes in app/pipeline/graph.py.
    """
    await pipeline_graph.ainvoke({"source_file_id": source_file_id})
