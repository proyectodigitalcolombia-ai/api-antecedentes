const cloudinary = require('cloudinary').v2;

/**
 * ARCHIVO: src/storage.js
 * Función: Sube el pantallazo del bot a la nube (Cloudinary)
 */

cloudinary.config({ 
  secure: true 
});

const uploadToCloudinary = async (buffer, jobId) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                public_id: `evidencia_${jobId}`,
                folder: 'evidencias_antecedentes',
                resource_type: 'image',
                format: 'jpg'
            },
            (error, result) => {
                if (error) {
                    console.error("Error al subir a Cloudinary:", error);
                    return reject(error);
                }
                resolve(result.secure_url);
            }
        );

        uploadStream.end(buffer);
    });
};

module.exports = { uploadToCloudinary };
