export function getControlledPreviewPolicy(documentRow, options = {}) {
  const downloadAllowed =
    typeof options.downloadAllowed === 'boolean'
      ? options.downloadAllowed
      : Boolean(documentRow.download_allowed);

  const printAllowed =
    typeof options.printAllowed === 'boolean'
      ? options.printAllowed
      : Boolean(documentRow.print_allowed);

  return {
    watermarkLabel:
      options.watermarkLabel ||
      (options.requiresConfidentialWatermark && downloadAllowed
        ? 'CONFIDENTIAL - CONTROLLED COPY'
        : 'CONTROLLED COPY'),
    previewAllowed: Boolean(documentRow.controlled_preview_enabled),
    downloadAllowed,
    printAllowed,
    mustAcknowledgeForCompliance: true,
    alreadyAcknowledged: Boolean(options.alreadyAcknowledged)
  };
}
