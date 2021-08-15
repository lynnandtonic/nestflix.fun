import { ImagePool } from '@squoosh/lib';
import fs from 'fs';
import { promisify } from 'util';
const writeFile = promisify(fs.writeFile);

const extension = {
    jpeg: "jpg",
    avif: "avif",
};

const encodeOptions = {
    jpeg: {
        key: 'mozjpeg',
        encodeOptions: {
            mozjpeg: {
                quality: 70,
            },
        },
    },
    avif: {
        key: 'avif',
        encodeOptions: {
            avif: {
                cqLevel: 41,
            },
        },
    },
};

function sizedName(filename, width, format) {
    const ext = extension[format];
    if (!ext) {
        throw new Error(`Unknown format ${format}`);
    }
    return filename.replace(/\.\w+$/, (_) => "-" + width + "w" + "." + ext);
}

async function resize(filename, width, format) {
    const out = sizedName(filename, width, format);
    if (fs.existsSync(".cache" + out)) {
        return out;
    }
    const imagePool = new ImagePool();
    const image = imagePool.ingestImage(`./src${filename}`);
    await image.decoded;
    await image.preprocess({
        resize: {
            enabled: true,
            width,
        },
    });
    const e = encodeOptions[format];
    await image.encode(e.encodeOptions);
    for (const encodedImage of Object.values(image.encodedWith)) {
        await writeFile(
            `.cache${out}`,
            (await encodedImage).binary,
        );
    }
    imagePool.close();
    return out;
}

await resize(process.argv[2], parseInt(process.argv[3], 10), process.argv[4])
