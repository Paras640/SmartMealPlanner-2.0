const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 4_200_000;

export async function prepareChatImage(file) {
    if (!file?.type?.startsWith("image/")) {
        throw new Error("Choose an image file to attach.");
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error("Choose an image smaller than 15 MB.");
    }
    if (typeof createImageBitmap !== "function") {
        throw new Error("Image attachments are not supported in this browser.");
    }

    const bitmap = await createImageBitmap(file);
    try {
        const maxDimension = 1536;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not process this image.");

        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.82, 0.65, 0.5]) {
            const imageData = canvas.toDataURL("image/jpeg", quality);
            if (imageData.length <= MAX_IMAGE_DATA_URL_LENGTH) return imageData;
        }

        throw new Error("This image is too large to attach. Try a smaller image.");
    } finally {
        bitmap.close();
    }
}
