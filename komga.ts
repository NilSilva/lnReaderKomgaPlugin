import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { fetchApi } from '@libs/fetch';

class KomgaPlugin implements Plugin.PluginBase {
  id = 'komga';
  name = 'Komga';
  icon = '';
  site = 'https://example.com/';
  version = '1.0.3';

  async makeRequest(url: string): Promise<string> {
    return await fetchApi(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=utf-8',
      },
      Referer: this.site
    }).then(res => res.text());

  }

  flattenArray(arr: any) {
    return arr.reduce((acc: any, obj: any) => {
      const { children, ...rest } = obj;
      acc.push(rest);

      if (children) {
        acc.push(...children);
      }

      return acc;
    }, []);
  };

  async getSeries(url: string): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    var response = await this.makeRequest(url);

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
    const library = filters?.library.value ? ('&library_id=' + filters?.library.value) : '';
    const read_status = filters?.read_status.value ? ('&read_status=' + filters?.read_status.value) : '';
    const status = filters?.status.value ? ('&status=' + filters?.status.value) : '';
    const sort = showLatestNovels ? 'lastModified,desc' : 'name,asc';

    const url = `${this.site}api/v1/series?page=${(pageNo - 1)}${library}${read_status}${status}&sort=${sort}`

    return await this.getSeries(url);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const url = this.site + novelPath

    var response = await this.makeRequest(url);

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

    const booksResponse = await this.makeRequest(this.site + `api/v1/series/${series.id}/books?unpaged=true`)

    const booksData = JSON.parse(booksResponse).content;

    for (let book of booksData) {
      const bookManifestResponse = await this.makeRequest(this.site + `opds/v2/books/${book.id}/manifest`);

      const bookManifest = JSON.parse(bookManifestResponse);

      const toc = this.flattenArray(bookManifest.toc)

      let i = 1;
      for (let page of bookManifest.readingOrder) {
        const tocItem = toc.find((v: any) => v.href.split('#')[0] === page.href);
        const title = tocItem ? tocItem.title : null
        chapters.push({
          name: `${i}/${bookManifest.readingOrder.length} - ${book.metadata.title}${title ? " - " + title : ''}`,
          path: 'opds/v2' + page.href.split('opds/v2').pop()
        })
        i++;
      }
    }

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const chapterText = await this.makeRequest(this.site + chapterPath);
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
