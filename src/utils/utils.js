function capitalizeFirstLetter(string) {
  const lowerCaseString = string.toLowerCase();
  return lowerCaseString.charAt(0).toUpperCase() + lowerCaseString.slice(1);
}

function getItemById(id, array) {
  return array.find((item) => item.id === id);
}

export {capitalizeFirstLetter, getItemById};