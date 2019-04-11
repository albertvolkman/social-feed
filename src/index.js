import * as Codebird from "codebird";
import moment from "moment";

export function socialfeed(_options) {
  var defaults = {
    plugin_folder: "", // a folder in which the plugin is located (with a slash in the end)
    template: "template.html", // a path to the template file
    show_media: false, // show images of attachments if available
    media_min_width: 300,
    length: 500, // maximum length of post message shown
    date_format: "ll",
    date_locale: "en"
  };
  //---------------------------------------------------------------------------------
  var options = Object.assign(defaults, _options),
    container = [],
    template,
    social_networks = [
      "facebook",
      "instagram",
      "vk",
      "blogspot",
      "twitter",
      "pinterest",
      "rss"
    ],
    posts_to_load_count = 0,
    loaded_post_count = 0;
  // container.empty().css('display', 'block');
  //---------------------------------------------------------------------------------

  //---------------------------------------------------------------------------------
  // This function performs consequent data loading from all of the sources by calling corresponding functions
  (function() {
    social_networks.forEach(function(network) {
      if (options[network]) {
        if (options[network].accounts) {
          posts_to_load_count +=
            options[network].limit * options[network].accounts.length;
        } else if (options[network].urls) {
          posts_to_load_count +=
            options[network].limit * options[network].urls.length;
        } else {
          posts_to_load_count += options[network].limit;
        }
      }
    });
  })();

  var Utility = {
    wrapLinks: function(string, social_network) {
      var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
      return string.replace(exp, Utility.wrapLinkTemplate);
    },
    wrapLinkTemplate: function(string) {
      return '<a target="_blank" href="' + string + '">' + string + "</a>";
    },
    shorten: function(string) {
      string = string.trim();
      if (string.length > options.length) {
        return (
          jQuery
            .trim(string)
            .substring(0, options.length)
            .split(" ")
            .slice(0, -1)
            .join(" ") + "..."
        );
      } else {
        return string;
      }
    },
    stripHTML: function(string) {
      if (typeof string === "undefined" || string === null) {
        return "";
      }
      return string.replace(/(<([^>]+)>)|nbsp;|\s{2,}|/gi, "");
    }
  };

  function SocialFeedPost(social_network, data) {
    this.content = data;
    this.content.social_network = social_network;
    this.content.attachment =
      this.content.attachment === undefined ? "" : this.content.attachment;
    this.content.time_ago = data.dt_create
      .locale(options.date_locale)
      .fromNow();
    this.content.date = data.dt_create
      .locale(options.date_locale)
      .format(options.date_format);
    this.content.dt_create = this.content.dt_create.valueOf();
    this.content.text = Utility.wrapLinks(
      Utility.shorten(data.message + " " + data.description),
      data.social_network
    );
    this.content.moderation_passed = options.moderation
      ? options.moderation(this.content)
      : true;

    Feed[social_network].posts.push(this);
  }

  var Feed = {
    template: false,
    init: function() {
      return new Promise(function(resolve, reject) {
        Feed.getTemplate(function() {
          social_networks.map(function(network) {
            Feed.processAll(network, resolve);
          });
        });
      });
    },
    processAll: function(network, cb) {
      if (options[network]) {
        if (options[network].accounts) {
          //loaded[network] = 0;
          options[network].accounts.forEach(function(account) {
            //loaded[network]++;
            Feed[network].getData(account);
          });
        } else if (options[network].urls) {
          options[network].urls.forEach(function(url) {
            Feed[network].getData(url);
          });
        } else {
          Feed[network].getData();
        }
      }
      cb(container);
    },
    getTemplate: function(callback) {
      if (Feed.template) return callback();
      else {
        if (options.template_html) {
          Feed.template = options.template_html;
          return callback();
        } else {
          fetch(options.template)
            .then(data => data.text())
            .then(template => {
              Feed.template = template;
              return callback();
            })
            .catch(function(error) {
              console.log(error);
            });
        }
      }
    },
    twitter: {
      posts: [],
      loaded: false,
      api: "http://api.tweecool.com/",

      getData: function(account) {
        Codebird.setConsumerKey(
          options.twitter.consumer_key,
          options.twitter.consumer_secret
        );

        // Allow setting your own proxy with Codebird
        if (options.twitter.proxy !== undefined) {
          Codebird.setProxy(options.twitter.proxy);
        }

        switch (account[0]) {
          case "@":
            var userid = account.substr(1);
            Codebird.__call(
              "statuses_userTimeline",
              {
                id: userid,
                count: options.twitter.limit,
                tweet_mode:
                  typeof options.twitter.tweet_mode === "undefined"
                    ? "compatibility"
                    : options.twitter.tweet_mode
              },
              Feed.twitter.utility.getPosts,
              true // this parameter required
            );
            break;
          case "#":
            var hashtag = account.substr(1);
            Codebird.__call(
              "search_tweets",
              {
                q: hashtag,
                count: options.twitter.limit,
                tweet_mode:
                  typeof options.twitter.tweet_mode === "undefined"
                    ? "compatibility"
                    : options.twitter.tweet_mode
              },
              function(reply) {
                Feed.twitter.utility.getPosts(reply.statuses);
              },
              true // this parameter required
            );
            break;
          default:
        }
      },
      utility: {
        getPosts: function(json) {
          if (json) {
            Array.prototype.forEach.call(json, function() {
              var element = this;
              var post = new SocialFeedPost(
                "twitter",
                Feed.twitter.utility.unifyPostData(element)
              );
              container.push(Object.assign({}, post).content);
            });
          }
        },
        unifyPostData: function(element) {
          var post = {};
          if (element.id) {
            post = {
              "id": element.id_str,
              "dt_create": moment(element.created_at, "dd MMM DD HH:mm:ss ZZ YYYY"),
              "author_link": "http://twitter.com/" + element.user.screen_name,
              "author_picture": element.user.profile_image_url_https,
              "post_url": post.author_link + "/status/" + element.id_str,
              "author_name": element.user.name,
              "message": typeof element.text === "undefined"
                ? element.full_text.substr(
                    element.display_text_range[0],
                    element.display_text_range[1]
                  )
                : element.text,
              "description": "",
              "link": "http://twitter.com/" + element.user.screen_name + "/status/" + element.id_str,
            };

            if (options.show_media === true && element.entities.media && element.entities.media.length > 0) {
              var image_url = element.entities.media[0].media_url_https;
              if (image_url) {
                post.attachment = image_url;
              }
            }
          }

          return post;
        }
      }
    },
    facebook: {
      posts: [],
      graph: "https://graph.facebook.com/",
      loaded: false,
      getData: function(account) {
        var proceed = function(request_url) {
          fetch(request_url)
            .then(res => res.text())
            .then(data => {
              Feed.facebook.utility.getPosts(data);
            });
        };
        var fields =
          "?fields=id,from,name,message,created_time,story,description,link";
        fields += options.show_media === true ? ",picture,object_id" : "";
        var request_url,
          limit = "&limit=" + options.facebook.limit,
          query_extention =
            "&access_token=" + options.facebook.access_token + "&callback=?";
        switch (account[0]) {
          case "@":
            var username = account.substr(1);
            Feed.facebook.utility.getUserId(username, function(userdata) {
              if (userdata.id !== "") {
                request_url =
                  Feed.facebook.graph +
                  "v2.12/" +
                  userdata.id +
                  "/posts" +
                  fields +
                  limit +
                  query_extention;
                proceed(request_url);
              }
            });
            break;
          case "!":
            var page = account.substr(1);
            request_url =
              Feed.facebook.graph +
              "v2.12/" +
              page +
              "/feed" +
              fields +
              limit +
              query_extention;
            proceed(request_url);
            break;
          default:
            proceed(request_url);
        }
      },
      utility: {
        getUserId: function(username, callback) {
          var query_extention =
            "&access_token=" + options.facebook.access_token + "&callback=?";
          var url =
            "https://graph.facebook.com/" + username + "?" + query_extention;
          var result = "";

          fetch(url)
            .then(function(res) {
              callback();
            })
            .catch(function(error) {
              console.log(error);
            });
        },
        prepareAttachment: function(element) {
          var image_url = element.picture;
          if (image_url.indexOf("_b.") !== -1) {
            //do nothing it is already big
          } else if (image_url.indexOf("safe_image.php") !== -1) {
            image_url = Feed.facebook.utility.getExternalImageURL(
              image_url,
              "url"
            );
          } else if (image_url.indexOf("app_full_proxy.php") !== -1) {
            image_url = Feed.facebook.utility.getExternalImageURL(
              image_url,
              "src"
            );
          } else if (element.object_id) {
            image_url =
              Feed.facebook.graph + element.object_id + "/picture/?type=normal";
          }
          return image_url;
        },
        getExternalImageURL: function(image_url, parameter) {
          image_url = decodeURIComponent(image_url).split(parameter + "=")[1];
          if (image_url.indexOf("fbcdn-sphotos") === -1) {
            return image_url.split("&")[0];
          } else {
            return image_url;
          }
        },
        getPosts: function(json) {
          if (json.data) {
            json.data.forEach(function(element) {
              var post = new SocialFeedPost(
                "facebook",
                Feed.facebook.utility.unifyPostData(element)
              );
              container.push(Object.assign({}, post).content);
            });
          }
        },
        unifyPostData: function(element) {
          var text = element.message ? element.message : element.story;
          var post = {
            "id": element.id,
            "dt_create": moment(element.created_time),
            "author_link": "http://facebook.com/" + element.from.id,
            "author_picture": Feed.facebook.graph + element.from.id + "/picture",
            "author_name": element.from.name,
            "name": element.name || "",
            "message": text ? text : "",
            "description": element.description ? element.description : "",
            "link": element.link ? element.link : "http://facebook.com/" + element.from.id,
          };

          if (options.show_media === true && element.picture) {
            var attachment = Feed.facebook.utility.prepareAttachment(element);
            if (attachment) {
              post.attachment = attachment;
            }
          }

          return post;
        }
      }
    },
    instagram: {
      posts: [],
      api: "https://api.instagram.com/v1/",
      loaded: false,
      accessType: function() {
        // If we have both the client_id and access_token set in options,
        // use access_token for authentication. If client_id is not set
        // then use access_token. If neither are set, log an error to console.
        if (
          typeof options.instagram.access_token === "undefined" &&
          typeof options.instagram.client_id === "undefined"
        ) {
          console.log(
            "You need to define a client_id or access_token to authenticate with Instagram's API."
          );
          return undefined;
        }
        if (options.instagram.access_token) {
          options.instagram.client_id = undefined;
        }
        options.instagram.access_type =
          typeof options.instagram.client_id === "undefined"
            ? "access_token"
            : "client_id";
        return options.instagram.access_type;
      },
      getData: function(account) {
        var url;

        // API endpoint URL depends on which authentication type we're using.
        if (this.accessType() !== "undefined") {
          var authTokenParams =
            options.instagram.access_type +
            "=" +
            options.instagram[options.instagram.access_type];
        }

        Feed.instagram.utility.getUsers();
      },
      utility: {
        getImages: function(json) {
          if (json.data) {
            json.data.forEach(function(element) {
              var post = new SocialFeedPost(
                "instagram",
                Feed.instagram.utility.unifyPostData(element)
              );
              container.push(Object.assign({}, post).content);
            });
          }
        },
        getUsers: function() {
          // API endpoint URL depends on which authentication type we're using.
          if (options.instagram.access_type !== "undefined") {
            var authTokenParams =
              options.instagram.access_type +
              "=" +
              options.instagram[options.instagram.access_type];

            var url =
              Feed.instagram.api +
              "users/self/media/recent/?" +
              authTokenParams +
              "&" +
              "count=" +
              options.instagram.limit +
              "&callback=?";

            fetch(url)
              .then(res => res.json())
              .then(data => Feed.instagram.utility.getImages(data))
              .catch(function(error) {
                console.log(error);
              });
          }
        },
        unifyPostData: function(element) {
          var post = {
            "id": element.id,
            "dt_create": moment(element.created_time * 1000),
            "author_link": "http://instagram.com/" + element.user.username,
            "author_picture": element.user.profile_picture,
            "author_name": element.user.full_name || element.user.username,
            "message": element.caption && element.caption ? element.caption.text : "",
            "description": "",
            "link": element.link,
          };

          if (options.show_media) {
            post.attachment = element.images.standard_resolution.url;
          }

          return post;
        }
      }
    },
    vk: {
      posts: [],
      loaded: false,
      base: "http://vk.com/",
      api: "https://api.vk.com/method/",
      user_json_template:
        "https://api.vk.com/method/" +
        "users.get?fields=first_name,%20last_name,%20screen_name,%20photo&uid=",
      group_json_template:
        "https://api.vk.com/method/" +
        "groups.getById?fields=first_name,%20last_name,%20screen_name,%20photo&gid=",
      getData: function(account) {
        var request_url;

        switch (account[0]) {
          case "@":
            var username = account.substr(1);
            request_url =
              Feed.vk.api +
              "wall.get?owner_id=" +
              username +
              "&filter=" +
              options.vk.source +
              "&count=" +
              options.vk.limit +
              "&callback=?";

            fetch(request_url)
              .then(res => res.json())
              .then(data => Feed.vk.utility.getPosts(data));
            break;
          case "#":
            var hashtag = account.substr(1);
            request_url =
              Feed.vk.api +
              "newsfeed.search?q=" +
              hashtag +
              "&count=" +
              options.vk.limit +
              "&callback=?";

            fetch(request_url)
              .then(res => res.json())
              .then(data => Feed.vk.utility.getPosts(data));
            break;
          default:
        }
      },
      utility: {
        getPosts: function(json) {
          if (json.response) {
            Array.prototype.forEach.call(json.response, function(el, i) {
              if (this != parseInt(this) && this.post_type === "post") {
                var owner_id = this.owner_id ? this.owner_id : this.from_id,
                  vk_wall_owner_url =
                    owner_id > 0
                      ? Feed.vk.user_json_template + owner_id + "&callback=?"
                      : Feed.vk.group_json_template +
                        -1 * owner_id +
                        "&callback=?",
                  element = this;

                fetch(vk_wall_owner_url)
                  .then(res => res.text())
                  .then(data => Feed.vk.utility.unifyPostData(data, element, json));
              }
            });
          }
        },
        unifyPostData: function(wall_owner, element, json) {
          var post = {
            "id": element.id,
            "dt_create": moment.unix(element.date),
            "description": "",
            "message": Utility.stripHTML(element.text),
          };

          if (options.show_media && element.attachment) {
            if (element.attachment.type === "link")
              post.attachment = element.attachment.link.image_src;
            if (element.attachment.type === "video")
              post.attachment = element.attachment.video.image_big;
            if (element.attachment.type === "photo")
              post.attachment = element.attachment.photo.src_big;
          }

          if (element.from_id > 0) {
            var vk_user_json =
              Feed.vk.user_json_template + element.from_id + "&callback=?";

            fetch(vk_user_json)
              .then(res => res.json())
              .then(data => {
                var post = new SocialFeedPost(
                  "vk",
                  Feed.vk.utility.getUser(data, post, element, json)
                );
                container.push(Object.assign({}, post).content);
              });
          } else {
            var vk_group_json =
              Feed.vk.group_json_template +
              -1 * element.from_id +
              "&callback=?";

            fetch(vk_group_json)
              .then(res => res.json())
              .then(data => {
                var post = new SocialFeedPost(
                  "vk",
                  Feed.vk.utility.getGroup(data, post, element, json)
                );
                container.push(Object.assign({}, post).content);
              });
          }
        },
        getUser: function(user_json, post, element, json) {
          return Object.assign(post, {
            "author_name": user_json.response[0].first_name + " " + user_json.response[0].last_name,
            "author_picture": user_json.response[0].photo,
            "author_link": Feed.vk.base + user_json.response[0].screen_name,
            "link": Feed.vk.base + user_json.response[0].screen_name + "?w=wall" + element.from_id + "_" + element.id,
          });
        },
        getGroup: function(user_json, post, element, json) {
          return Object.assign(post, {
            "author_name": user_json.response[0].name,
            "author_picture": user_json.response[0].photo,
            "author_link": Feed.vk.base + user_json.response[0].screen_name,
            "link": Feed.vk.base + user_json.response[0].screen_name + "?w=wall-" + user_json.response[0].gid + "_" + element.id,
          });
        }
      }
    },
    blogspot: {
      loaded: false,
      getData: function(account) {
        var url;

        switch (account[0]) {
          case "@":
            var username = account.substr(1);
            url =
              "http://" +
              username +
              ".blogspot.com/feeds/posts/default?alt=json-in-script&callback=?";

            fetch(url)
              .then(res => res.json())
              .then(data => getPosts(data));
            break;
          default:
        }
      },
      utility: {
        getPosts: function(json) {
          Array.prototype.forEach.call(json.feed.entry, function() {
            var element = this;
            var post = {
              "id": element.id.$t.replace(/[^a-z0-9]/gi, ""),
              "dt_create": moment(element.published.$t),
              "author_link": element.author[0].uri.$t,
              "author_picture": "http:" + element.author[0].gd$image.src,
              "author_name": element.author[0].name.$t,
              "message": element.title.$t + "</br></br>" + stripHTML(element.content.$t),
              "description": "",
              "link": element.link.pop().href,
            };

            if (options.show_media && element.media$thumbnail) {
              post.attachment = element.media$thumbnail.url;
            }

            container.push(Object.assign({}, post).content);
          });
        }
      }
    },
    pinterest: {
      posts: [],
      loaded: false,
      apiv1: "https://api.pinterest.com/v1/",

      getData: function(account) {
        var request_url,
          limit = "limit=" + options.pinterest.limit,
          fields =
            "fields=id,created_at,link,note,creator(url,first_name,last_name,image),image",
          query_extention =
            fields +
            "&access_token=" +
            options.pinterest.access_token +
            "&" +
            limit +
            "&callback=?";
        switch (account[0]) {
          case "@":
            var username = account.substr(1);
            if (username === "me") {
              request_url =
                Feed.pinterest.apiv1 + "me/pins/?" + query_extention;
            } else {
              request_url =
                Feed.pinterest.apiv1 +
                "boards/" +
                username +
                "/pins?" +
                query_extention;
            }
            break;
          default:
        }
        fetch(request_url)
          .then(res => res.json())
          .then(data => Feed.pinterest.utility.getPosts(data));
      },
      utility: {
        getPosts: function(json) {
          json.data.forEach(function(element) {
            var post = new SocialFeedPost(
              "pinterest",
              Feed.pinterest.utility.unifyPostData(element)
            );
            container.push(Object.assign({}, post).content);
          });
        },

        unifyPostData: function(element) {
          var post = {
            "id": element.id,
            "dt_create": moment(element.created_at),
            "author_link": element.creator.url,
            "author_picture": element.creator.image["60x60"].url,
            "author_name": element.creator.first_name + element.creator.last_name,
            "message": element.note,
            "description": "",
            "social_network": "pinterest",
            "link": element.link ? element.link : "https://www.pinterest.com/pin/" + element.id,
          };

          if (options.show_media) {
            post.attachment = element.image.original.url;
          }

          return post;
        }
      }
    },
    rss: {
      posts: [],
      loaded: false,
      api: "https://query.yahooapis.com/v1/public/yql?q=",
      datatype: "json",

      getData: function(url) {
        var limit = options.rss.limit,
          yql = encodeURIComponent(
            "select entry FROM feednormalizer where url='" +
              url +
              "' AND output='atom_1.0' | truncate(count=" +
              limit +
              ")"
          ),
          request_url = Feed.rss.api + yql + "&format=json&callback=?";

        fetch(request_url)
          .then(data => data.json())
          .then(data => Feed.rss.utility.getPosts(data));
      },
      utility: {
        getPosts: function(json) {
          if (json.query.count > 0) {
            Array.prototype.forEach.call(json.query.results.feed, function(
              el,
              i
            ) {
              var post = new SocialFeedPost(
                "rss",
                Feed.rss.utility.unifyPostData(i, el)
              );
              container.push(Object.assign({}, post).content);
            });
          }
        },

        unifyPostData: function(index, element) {
          var item = element.entry !== undefined ? item = element.entry : element;

          var post = {
            "id": '"' + item.id + '"',
            "dt_create": moment(item.published, "YYYY-MM-DDTHH:mm:ssZ", "en"),
            "author_link": "",
            "author_picture": "",
            "author_name": "",
            "message": item.title,
            "description": "",
            "social_network": "rss",
            "link": item.link.href,
          };

          if (item.creator !== undefined) {
            post.author_name = item.creator;
          }
          if (item.summary !== undefined) {
            post.description = Utility.stripHTML(item.summary.content);
          }
          if (options.show_media && item.thumbnail !== undefined) {
            post.attachment = item.thumbnail.url;
          }

          return post;
        }
      }
    }
  };

  return Feed.init();
}
