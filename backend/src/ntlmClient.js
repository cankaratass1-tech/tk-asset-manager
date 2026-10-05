// NTLM kimlik doğrulaması cross-origin kısıtlaması nedeniyle sadece backend'den yapılabilir.
// httpntlm standart NTLM type1/type2/type3 el sıkışmasını yürütür.
const httpntlm = require("httpntlm");

function ntlmGet({ url, username, password, domain = "", workstation = "" }) {
  return new Promise((resolve, reject) => {
    httpntlm.get(
      { url, username, password, domain, workstation },
      (err, res) => {
        if (err) return reject(err);
        resolve({ statusCode: res.statusCode, body: res.body, headers: res.headers });
      }
    );
  });
}

module.exports = { ntlmGet };
