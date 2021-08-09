/**
 * Copyright (c) 2020 Google Inc
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { JSDOM } from 'jsdom';
import { promisify } from 'util';
import imageSize from 'image-size';
import path from 'path';
import fs from 'fs';
import { mkdirpSync } from 'fs-extra';
import sharp from 'sharp';
const sizeOf = promisify(imageSize);

function isThumbnail(filename) {
    return filename.match(/-thumb.jpg$/i)
        || filename.match(/-still[0-9]*.jpg$/i)
        || filename.match(/-submovie[0-9]*.jpg$/i)
        ;
}

const heroWidths = [1280, 640];
const thumbWidths = [1200, 640, 320];

const extension = {
    jpeg: "jpg",
    webp: "webp",
    avif: "avif",
};

const quality = {
    avif: 40,
    default: 60,
};

async function srcset(filename, format) {
    const widths = (isThumbnail(filename) ? thumbWidths : heroWidths);
    const names = await Promise.all(
        widths.map((w) => resize(filename, w, format))
    );
    return names.map((n, i) => `${n} ${widths[i]}w`).join(", ");
};

async function resize(filename, width, format) {
    const out = sizedName(filename, width, format);
    if (fs.existsSync(".cache" + out)) {
        return out;
    }
    await sharp("./src" + filename)
        .rotate() // Manifest rotation from metadata
        .resize(width)
    [format]({
        quality: quality[format] || quality.default,
        reductionEffort: 6,
    })
        .toFile(".cache" + out);

    return out;
}

function sizedName(filename, width, format) {
    const ext = extension[format];
    if (!ext) {
        throw new Error(`Unknown format ${format}`);
    }
    return filename.replace(/\.\w+$/, (_) => "-" + width + "w" + "." + ext);
}

async function processImage(img, outputPath) {
    let src = img.getAttribute("src");
    if (/^\.+\//.test(src)) {
        // resolve relative URL
        src =
            "/" +
            path.relative("./.cache/", path.resolve(path.dirname(outputPath), src));
        if (path.sep == "\\") {
            src = src.replace(/\\/g, "/");
        }
    }
    const srcFilename = `./src${src}`;
    const cachedFilename = `.cache${src}`;
    const cachedFilenameDirectory = path.dirname(cachedFilename);
    if (!fs.existsSync(cachedFilenameDirectory)) {
        mkdirpSync(cachedFilenameDirectory);
    }
    let dimensions;
    if (!fs.existsSync(cachedFilename)) {
        if (src.endsWith("svg")) {
            fs.copyFileSync(srcFilename, cachedFilename);
        }
    }
    try {
        dimensions = await sizeOf(srcFilename);
    } catch (e) {
        console.warn(e.message, src);
        return;
    }
    if (!img.getAttribute("width")) {
        img.setAttribute("width", dimensions.width);
        img.setAttribute("height", dimensions.height);
    }
    if (dimensions.type == "svg") {
        return;
    }
    if (img.tagName == "IMG") {
        img.setAttribute("decoding", "async");
        img.setAttribute("loading", "lazy");
        const doc = img.ownerDocument;
        const picture = doc.createElement("picture");
        const avif = doc.createElement("source");
        const jpeg = doc.createElement("source");
        await setSrcset(avif, src, "avif");
        avif.setAttribute("type", "image/avif");
        await setSrcset(jpeg, src, "jpeg");
        jpeg.setAttribute("type", "image/jpeg");
        picture.appendChild(avif);
        picture.appendChild(jpeg);
        img.setAttribute('src', jpeg.getAttribute('srcset').split(' ')[0]);
        img.parentElement.replaceChild(picture, img);
        picture.appendChild(img);
    } else if (!img.getAttribute("srcset")) {
        await setSrcset(img, src, "jpeg");
    }
}

async function setSrcset(img, src, format) {
    img.setAttribute("srcset", await srcset(src, format));
    img.setAttribute(
        "sizes",
        isThumbnail(src)
            ? thumbWidths.map((width) => `(max-width: ${width}px) ${width}px`).join(', ') + ', 100vw'
            : heroWidths.map((width) => `(max-width: ${width}px) ${width}px`).join(', ') + ', 100vw'
    );
}

export default async function processImagesAndWriteFile(templateFilename, templateString) {
    let content = templateString;
    const dom = new JSDOM(content);
    const images = [...dom.window.document.querySelectorAll('img')];

    if (images.length > 0) {
        await Promise.all(images.map((i) => processImage(i, templateFilename)));
        content = dom.serialize();
    }
    fs.writeFileSync(templateFilename, content, { encoding: 'utf8' });
}
