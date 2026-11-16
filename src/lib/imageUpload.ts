import { supabase } from '@/lib/supabase';

export async function resizeImage(file: File, maxDimension: number = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Não foi possível processar a imagem.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível converter a imagem.'))),
      'image/jpeg',
      0.82,
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível ler a imagem.')));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadProductImage(
  bucketName: 'product-images' | 'product-pictures',
  userId: string,
  isDemo: boolean,
  file: File,
): Promise<string> {
  if (supabase && !isDemo) {
    const imageBlob = await resizeImage(file);
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(bucketName).upload(path, imageBlob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    return supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl;
  }
  const imageBlob = await resizeImage(file);
  return blobToDataUrl(imageBlob);
}
