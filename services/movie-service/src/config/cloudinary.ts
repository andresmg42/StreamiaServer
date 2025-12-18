/**
 * @file cloudinary.ts
 * @description Cloudinary configuration and utility functions for media uploads.
 * Handles video and subtitle file uploads to Cloudinary CDN.
 * @author Streamia Team
 * @version 1.0.0
 * @created 2025-10-26
 * 
 * @module Config/Cloudinary
 */

import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary service configuration
 * @constant
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Interface for Cloudinary video upload results
 * @interface CloudinaryUploadResult
 * @property {string} public_id - Unique public identifier in Cloudinary
 * @property {string} secure_url - HTTPS URL for the uploaded video
 * @property {number} duration - Video duration in seconds
 * @property {string} format - Video format (mp4, webm, etc.)
 * @property {string} resource_type - Type of resource ('video')
 * @property {string} [thumbnail_url] - Generated thumbnail URL
 */
export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  duration: number;
  format: string;
  resource_type: string;
  thumbnail_url?: string;
}

/**
 * Interface for Cloudinary subtitle upload results
 * @interface CloudinarySubtitleResult
 * @property {string} public_id - Unique public identifier in Cloudinary
 * @property {string} secure_url - HTTPS URL for the uploaded subtitle file
 */
export interface CloudinarySubtitleResult {
  public_id: string;
  secure_url: string;
}

/**
 * Uploads a video file to Cloudinary
 * @async
 * @function uploadToCloudinary
 * @param {string} filePath - Local path to the video file
 * @param {Object} [options={}] - Additional Cloudinary upload options
 * @returns {Promise<CloudinaryUploadResult>} Upload result with video metadata
 * @throws {Error} If upload fails or file is invalid
 * @example
 * const result = await uploadToCloudinary('/path/to/video.mp4', { folder: 'custom-folder' });
 */
export const uploadToCloudinary = async (filePath: string, options = {}): Promise<CloudinaryUploadResult> => {
  try {
    console.log('🎬 CLOUDINARY_DEBUG - Uploading video:', filePath);
    
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'streamia/movies',
      ...options
    });
    
    console.log('✅ CLOUDINARY_DEBUG - Video uploaded successfully:', result.secure_url);
    
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      duration: result.duration,
      format: result.format,
      resource_type: result.resource_type,
      thumbnail_url: result.secure_url.replace(/\.(mp4|webm|mov)$/, '.jpg')
    };
  } catch (error: any) {
    console.error('❌ CLOUDINARY_DEBUG - Error uploading video:', error);
    console.error('❌ CLOUDINARY_DEBUG - Error details:', error.message);
    throw new Error(`Failed to upload video to Cloudinary: ${error.message}`);
  }
};

/**
 * Uploads a subtitle file to Cloudinary
 * @async
 * @function uploadSubtitle
 * @param {string} filePath - Local path to the subtitle file (.vtt, .srt)
 * @param {Object} [options={}] - Additional Cloudinary upload options
 * @returns {Promise<CloudinarySubtitleResult>} Upload result with subtitle metadata
 * @throws {Error} If upload fails, file doesn't exist, or file is invalid
 * @example
 * const result = await uploadSubtitle('/path/to/subtitles.vtt', { public_id: 'movie_es' });
 */
export const uploadSubtitle = async (filePath: string, options = {}): Promise<CloudinarySubtitleResult> => {
  try {
    console.log('📝 CLOUDINARY_DEBUG - Uploading subtitle:', filePath);
    
    // Check if file exists before uploading
    const fs = await import('fs');
    const fileExists = fs.existsSync(filePath);
    
    if (!fileExists) {
      throw new Error(`The file does not exist in the path: ${filePath}`);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto',
      folder: 'streamia/subtitles',
      ...options
    });
    
    console.log('✅ CLOUDINARY_DEBUG - Subtitle uploaded successfully:', result.secure_url);
    
    return {
      public_id: result.public_id,
      secure_url: result.secure_url
    };
  } catch (error: any) {
    console.error('❌ CLOUDINARY_DEBUG - Error uploading subtitle:', error);
    console.error('❌ CLOUDINARY_DEBUG - Error message:', error.message);
    console.error('❌ CLOUDINARY_DEBUG - Error code:', error.code || 'No code');
    throw new Error(`Failed to upload subtitle to Cloudinary: ${error.message}`);
  }
};

export default cloudinary;