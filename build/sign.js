// Script de firma vacío — omite code signing para builds personales
exports.default = async function(configuration) {
    // No hacer nada: no firmar el ejecutable
    return;
};
