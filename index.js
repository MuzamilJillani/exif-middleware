const express = require('express');
const { execSync } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'EXIF Keyword Injector' }));

/**
 * POST /add-exif
 * 
 * Accepts multipart/form-data with:
 *   - image: the image file (binary)
 *   - keywords: comma-separated string e.g. "pest control,McKinney,rodent exclusion"
 *   - title: (optional) image title
 *   - description: (optional) image description
 *   - city: (optional) city name for IPTC location
 * 
 * Returns: modified image binary (image/jpeg)
 */
app.post('/add-exif', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input_${Date.now()}.jpg`);
  const outputPath = path.join(tmpDir, `output_${Date.now()}.jpg`);

  try {
    // Write uploaded image to temp file
    fs.writeFileSync(inputPath, req.file.buffer);

    // Build exiftool arguments
    const args = [];

    // Keywords (stored in both IPTC and XMP for maximum compatibility)
    if (req.body.keywords) {
      const keywords = req.body.keywords.split(',').map(k => k.trim()).filter(Boolean);
      keywords.forEach(keyword => {
        args.push(`-IPTC:Keywords="${keyword}"`);
        args.push(`-XMP:Subject="${keyword}"`);
      });
    }

    // Title
    if (req.body.title) {
      args.push(`-IPTC:ObjectName="${req.body.title}"`);
      args.push(`-XMP:Title="${req.body.title}"`);
    }

    // Description
    if (req.body.description) {
      args.push(`-IPTC:Caption-Abstract="${req.body.description}"`);
      args.push(`-XMP:Description="${req.body.description}"`);
    }

    // City / location
    if (req.body.city) {
      args.push(`-IPTC:City="${req.body.city}"`);
      args.push(`-XMP:City="${req.body.city}"`);
    }

    // Run exiftool - preserve all existing EXIF, just add our fields
    // -overwrite_original prevents creating backup files
    const cmd = `exiftool ${args.join(' ')} -overwrite_original -o "${outputPath}" "${inputPath}"`;
    execSync(cmd, { timeout: 30000 });

    // Read modified image and send back
    const modifiedImage = fs.readFileSync(outputPath);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `attachment; filename="${req.file.originalname || 'image.jpg'}"`);
    res.send(modifiedImage);

  } catch (err) {
    console.error('ExifTool error:', err.message);
    res.status(500).json({ error: 'Failed to process image', details: err.message });
  } finally {
    // Cleanup temp files
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EXIF middleware running on port ${PORT}`));
