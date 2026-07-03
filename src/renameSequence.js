function buildRenameSubmission(rawName) {
  const name = String(rawName ?? '').trim();
  if (!name) {
    return undefined;
  }

  return {
    command: '/rename',
    name,
  };
}

module.exports = {
  buildRenameSubmission,
};
