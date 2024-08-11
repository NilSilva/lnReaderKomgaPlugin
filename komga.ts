import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class KomgaPlugin implements Plugin.PluginBase {
    id = 'komga';
    name = 'Komga';
    icon = '';
    site = 'https://example.com/';
    version = '1.0.0';

    makeRequest(method: string, url: string): Promise<string> {
        return new Promise(function (resolve, reject) {
            let xhr = new XMLHttpRequest();
            xhr.open(method, url);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(xhr.response);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send();
        });
    }

    async getSeries(url: string): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];

        var response = await this.makeRequest("get", url);

        const series = JSON.parse(response).content;

        for (let s of series) {
            novels.push({
                name: s.name,
                path: "api/v1/series/" + s.id,
                cover: this.site + `api/v1/series/${s.id}/thumbnail`
            })
        }

        return novels;
    }

    async popularNovels(
        pageNo: number,
        {
            showLatestNovels,
            filters,
        }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {

        const url = `${this.site}api/v1/series?page=${(pageNo - 1)}${filters?.library.value ? '&library_id=' + filters?.library.value : ''}${filters?.read_status.value ? '&read_status=' + filters?.read_status.value : ''}${filters?.status.value ? '&status=' + filters?.status.value : ''}&sort=${showLatestNovels ? 'lastModified,desc' : 'name,asc'}`

        return await this.getSeries(url);
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: 'Untitled',
        };

        const url = this.site + novelPath

        var response = await this.makeRequest("get", url);

        const series = JSON.parse(response);

        novel.name = series.name;
        novel.author = series.booksMetadata.authors
            .filter((author: any) => author.role === 'writer')
            .reduce(((accumulated: string, current: any) => accumulated + (accumulated !== '' ? ', ' : '') + current.name), "");
        novel.cover = this.site + `api/v1/series/${series.id}/thumbnail`;
        novel.genres = series.metadata.genres.join(", ");

        switch (series.metadata.status) {
            case "ENDED":
                novel.status = NovelStatus.Completed;
                break;
            case "ONGOING":
                novel.status = NovelStatus.Ongoing;
                break;
            case "ABANDONED":
                novel.status = NovelStatus.Cancelled;
                break;
            case "HIATUS":
                novel.status = NovelStatus.OnHiatus;
                break;
            default:
                novel.status = NovelStatus.Unknown;
        }

        novel.summary = series.booksMetadata.summary;

        const chapters: Plugin.ChapterItem[] = [];

        const booksResponse = await this.makeRequest("get", this.site + `api/v1/series/${series.id}/books`)

        const booksData = JSON.parse(booksResponse).content;

        for (let book of booksData) {
            const bookManifestResponse = await this.makeRequest("get", this.site + `api/v1/books/${book.id}/manifest`);

            const bookManifest = JSON.parse(bookManifestResponse);
            let i = 0;
            for (let page of bookManifest.readingOrder) {
                chapters.push({
                    name: `${i} - ${book.metadata.title}`,
                    path: 'api/v1' + page.href.split('api/v1').pop()
                })
                i++;
            }
        }

        novel.chapters = chapters;
        return novel;
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const chapterText = await this.makeRequest("get", this.site + chapterPath);
        return chapterText;
    }

    async searchNovels(
        searchTerm: string,
        pageNo: number,
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}api/v1/series?search=${searchTerm}&page=${(pageNo - 1)}`

        return await this.getSeries(url);
    }

    filters = {
        status: {
            value: '',
            label: 'Status',
            options: [
                { label: 'All', value: '' },
                { label: 'Completed', value: NovelStatus.Completed },
                { label: 'Ongoing', value: NovelStatus.Ongoing },
                { label: 'Cancelled', value: NovelStatus.Cancelled },
                { label: 'OnHiatus', value: NovelStatus.OnHiatus },
            ],
            type: FilterTypes.Picker,
        },
        // library: {
        //     value: '',
        //     label: 'Library',
        //     options: [
        //         { label: 'All', value: '' },
        //         { label: "<Library name>", value: "<Library id>" }
        //     ],
        //     type: FilterTypes.Picker
        // },
        read_status: {
            value: '',
            label: 'Read status',
            options: [
                { label: 'All', value: '' },
                { label: 'Unread', value: 'UNREAD' },
                { label: 'Read', value: "READ" },
                { label: 'In progress', value: "IN_PROGRESS" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new KomgaPlugin();
