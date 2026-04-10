export function getControlledPreviewPolicy(documentRow, options = {}) {
  return {
    watermarkLabel: 'CONTROLLED COPY',
    previewAllowed: Boolean(documentRow.controlled_preview_enabled),
    downloadAllowed: Boolean(documentRow.download_allowed),
    printAllowed: Boolean(documentRow.print_allowed),
    mustAcknowledgeForCompliance: true,
    alreadyAcknowledged: Boolean(options.alreadyAcknowledged)
  };
}

