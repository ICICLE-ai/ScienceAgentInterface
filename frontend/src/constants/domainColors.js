let domainColorMap = {
  "Computational Chemistry": "#ff7f50",
  "Bioinformatics": "#3cb371",
  "Geographical Information Science": "#4682b4",
  "Psychology and Cognitive science": "#9370db"
};

// Set domain color to its set value, if value not there set it to grey
export const getDomainColor = (domain) => {
  return domainColorMap[domain] || "#6c757d";
};

export const setDomainColor = (domain, color) => {
  domainColorMap[domain] = color;
};

export const getDomainColors = () => {
  return domainColorMap;
};