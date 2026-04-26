const fs = require('fs');
const path = require('path');

const ensureUploadDir = () => {
    const uploadDir = path.join(__dirname, '../../uploads/evidencias');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
};

const deleteFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Error al eliminar archivo:', error);
    }
};

module.exports = {
    ensureUploadDir,
    deleteFile
};
