import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@typings/plugin';
import { load as parseHTML } from 'cheerio';

class KomgaPlugin implements Plugin.PluginBase {
  id = 'komga';
  name = 'Komga';
  icon = '';
  version = '1.0.6';

  // Get url, password, email from storage or hardcode them in
  // site = storage.get("url");
  site = "https://example.com/"
  // email = storage.get("email");
  email = "";
  // password = storage.get("password");
  password = "";

  includedLibraries = ['<Library 1 ID>', '<Library 2 ID>']

  async makeRequest(url: string): Promise<string> {
    return await fetchApi(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=utf-8',
        "Authorization": `Basic ${this.btoa(this.email + ":" + this.password)}`
      },
      Referer: this.site
    }).then(res => res.text());
  }

  btoa(input: string = '') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input;
    let output = '';

    for (let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || (map = '=', i % 1);
      output += map.charAt(63 & block >> 8 - i % 1 * 8)) {

      charCode = str.charCodeAt(i += 3 / 4);

      if (charCode > 0xFF) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }

      block = block << 8 | charCode;
    }

    return output;
  }

  flattenArray(arr: any) {
    return arr.reduce((acc: any, obj: any) => {
      const { children, ...rest } = obj;
      acc.push(rest);

      if (children) {
        acc.push(...this.flattenArray(children));
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

    let includedLibraries = ""

    this.includedLibraries.forEach(id => {
      if (includedLibraries === "") {
        includedLibraries = `&library_id=${id}`;
      } else {
        includedLibraries = `${includedLibraries}&library_id=${id}`
      }
    })

    const url = `${this.site}api/v1/series?page=${(pageNo - 1)}${library}${read_status}${status}&sort=${sort}${library ? library : includedLibraries}`

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
        const tocItem = toc.find((v: any) => v.href?.split('#')[0] === page.href);
        const title = tocItem ? tocItem.title : null
        chapters.push({
          name: `${i}/${bookManifest.readingOrder.length} - ${book.metadata.title}${title ? " - " + title : ''}`,
          path: 'opds/v2' + page.href?.split('opds/v2').pop()
        })
        i++;
      }
    }

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const chapterText = await this.makeRequest(this.site + chapterPath);
    return this.addUrlToImageHref(chapterText, this.site + chapterPath.split("/").slice(0, -1).join("/") + '/');
  }

  addUrlToImageHref(htmlString: string, baseUrl: string): string  {
    const $ = parseHTML(htmlString, { xmlMode: true });

    // Replace all image elements to img and add url to src
    $('svg image').each((_, image) => {
        const href = $(image).attr('href') || $(image).attr('xlink:href');
        const width = $(image).attr('width');
        const height = $(image).attr('height');

        if (href) {
            const img = $('<img />').attr({
                src: href.startsWith('http') ? href : `${baseUrl}${href}`,
                width: width || undefined,
                height: height || undefined
            });
            $(image).closest('svg').replaceWith(img);
        }
    });

    // Add url to src
    $('img').each((_, img) => {
        const src = $(img).attr('src');
        if (src && !src.startsWith("http")) {
            $(img).attr('src', `${baseUrl}${src}`);
        }
    });

    return $.xml();
}

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let includedLibraries = ""

    this.includedLibraries.forEach(id => {
      if (includedLibraries === "") {
        includedLibraries = `&library_id=${id}`;
      } else {
        includedLibraries = `${includedLibraries}&library_id=${id}`
      }
    })

    const url = `${this.site}api/v1/series?search=${searchTerm}&page=${(pageNo - 1)}${includedLibraries ? includedLibraries : ""}`

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

  // Plugin settings to be configured by user
  pluginSettings = {
    email: {
      value: "",
      label: "Email",
      type: "Text"
    },
    password: {
      value: "",
      label: "Password"
    },
    url: {
      value: "",
      label: "URL"
    }
  };
}

export default new KomgaPlugin();
