const run = async (nodeName, networkInfo) => {
  const { wsUri, userDefinedTypes } = networkInfo.nodesByName[nodeName];
  const api = await zombie.connect(wsUri, userDefinedTypes);
  const validator = await api.query.session.validators();
  return validator.length;
};
