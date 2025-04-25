import chokidar from 'chokidar';
import fs from 'fs';
import pug from 'pug';
import fse from 'fs-extra';
import processImagesAndWriteFile from './src/img.js';

const isProductionBuild = !!process.env.PRODUCTION;

function debug(...msgs) {
    if (process.env.DEBUG) {
        console.log(...msgs);
    }
}

function mkdirs() {
    [
        '_site',
        '.cache',
    ].forEach(function (dir) {
        fse.mkdirpSync(dir);
    });
}

let globalData = {};

function initialSetup() {
    mkdirs();
}

function readAllJsonFiles() {
    globalData = {
        collections: {
            all: [],
            byTitle: {},
            ignoredTags: [
                'all',
                'byTitle',
                'ignoredTags',
                'entry',
                'movie',
                'tv series',
                'tv special',
                'web series',
                'video series',
                'search',
            ].map((it) => it.toLowerCase()),
        },
    };
    const jsonFileDir = './src/data';
    const jsonFiles = fs.readdirSync('./src/data');
    for (const jsonFile of jsonFiles) {
        if (!jsonFile.endsWith(".json")) {
            continue;
        }
        let json;
        try {
            json = JSON.parse(fs.readFileSync(`${jsonFileDir}/${jsonFile}`, {encoding: 'utf8'}));
        } catch (e) {
            console.error(`failed to parse ${jsonFile}: ${e}`);
            throw e;
        }
        const eleventyData = {
            ...json,
            data: {
                ...json,
                page: {
                    url: `/${json.slug}/`
                },
            },
        };
        ['all', ...eleventyData.data.tags].forEach(function (tag) {
            globalData.collections[tag] = globalData.collections[tag] || [];
            globalData.collections[tag].push(eleventyData);
        });
        
        globalData.collections.byTitle[eleventyData.data.title] = eleventyData;

        globalData.collections.search = {
            fields: [
                'title',
                'description',
                'parent',
                'parent2',
                'director',
                'starring',
                'slug',
                'labels',
            ]
        };

        globalData.collections.search.data = globalData.collections.all.map(function mapper(entry) {
            const output = {};
            for (const key of globalData.collections.search.fields) {
                if (entry[key]) {
                    const value = entry[key];
                    output[key] = value.toLowerCase
                    ? value.toLowerCase()
                    : Array.isArray(value)
                        ? value.join(', ').toLowerCase()
                        : value;
                }
            }
            return output;
        });
    }
}

async function writePugToFile(filename, pugString) {
    await processImagesAndWriteFile(filename, pugString);
}

console.log('starting build');

initialSetup();

readAllJsonFiles();

const pugOptions = {
    pretty: !isProductionBuild,
};

// render top level pug templates
const topLevelPugFilesWatcher = chokidar.watch(
    'src/*.pug',
    {
        ignoreInitial: false,
        persistent: false,
    },
)
    .on('ready', handleWatcherEvent)
    ;

async function handleWatcherEvent(path) {
    // copy static files
    fse.mkdirpSync('_site/img');
    fse.copySync('./src/img/_icons', '_site/img/_icons');
    fse.copySync('./src/img/_logos', '_site/img/_logos');

    // generate top level html files from pug templates
    readAllJsonFiles();
    // chokidar returns different entries per OS
    const allTopLevelPugFiles = Object.values(topLevelPugFilesWatcher.getWatched())
        .flat()
        .filter((filename) => filename.endsWith('.pug'))
        ;
    for (const pugFilename of allTopLevelPugFiles) {
        const fn = pug.compileFile(`src/${pugFilename}`, pugOptions);
        const dataForPug = {
            collections: globalData.collections,
        };
        await writePugToFile(`_site/${pugFilename.replace('.pug', '.html')}`, fn(dataForPug));
    }

    // generate all json-templated entries
    const movieFunction = pug.compileFile('./src/_includes/movie.pug', pugOptions);
    for (const movie of globalData.collections.all) {
        const dataForPug = {
            ...movie,
            collections: globalData.collections,
        };
        const pugDir = `_site/${dataForPug.slug}`;
        fse.mkdirpSync(pugDir);
        await writePugToFile(`${pugDir}/index.html`, movieFunction(dataForPug));
    }

    // copy all cached images to the site directory
    fse.copySync('.cache/img', '_site/img', {overwrite: true});
}

const watcher = chokidar.watch([
    'src/**/*.pug',
    'src/data/**/*.json',
    'src/**/*.jpg',
    'src/**/*.svg',
], {
    ignoreInitial: true,
    persistent: !isProductionBuild,
})
    .on('change', handleWatcherEvent)
    .on('unlink', handleWatcherEvent)
    .on('add', handleWatcherEvent)
    ;

if (isProductionBuild) {
    watcher.close();
    console.log('build completed');
} else {
    console.log('waiting for changes');
    console.log('Available on http://127.0.0.1:8080');
}


// cd src && for i in $(ls *.pug); do echo $i; ../node_modules/js-yaml/bin/js-yaml.js $i | jq ".[0]" > data/${i%%.*}.json; done
