<template>
  <div class="page">
    <!-- Domain Banner -->
    <div class="domain-banner">
      <DomainsBanner
        v-bind:title="title"
        v-bind:context="1"
        @filter="filter"
      >
      </DomainsBanner>
    </div>

    <!-- Domains -->
    <div v-if="tokens.length && searchThreshold !== false && !disconnected">
      <ul class="domains">
        <li v-for="(domain, i) in domainsList" :key="i">
          <DomainListEntry
            v-bind:domain="domain"
            v-bind:cw721="cw721"
            v-bind:cwClient="cwClient"
            v-bind:isSubdomain="isSubdomain(domain)"
            v-bind:isReadOnly="false"
            v-bind:baseCost="parseInt(config.base_cost)"
            v-bind:collapsible="true"
            v-bind:status="statuses[domain]"
            @ownershipTransfer="newOwnerHandler"
            @listing="newListingHandler"
            @dataResolution="newOwnerHandler"
            :key="'item-'+i"
          >
          </DomainListEntry>
        </li>
      </ul>
      <div class="paging row">
        <div class="paging-items row">
          <div class="col left">
            <button :class="{'chevron-left': true, 'pointer': page > 0, 'disabled': page <= 0}" @click="pageHandler((page - 1));" :disabled="page <= 0"></button>
          </div>
          <div class="col mid">
            <div class="paging-display">
              <div class="page-select-wrapper">
                <select class="page-select"  @change="onChange($event)" v-model="page">
                  <option class="page-select-option form-control" v-for="(pageOption, i) in totalPages" :key="'page-option-'+i" :value="i">{{ String(i+1) }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="col right">
            <button :class="{'chevron-right': true, 'pointer': page < (totalPages - 1), 'disabled': page >= (totalPages - 1)}" @click="pageHandler((page + 1));" :disabled="page >= (totalPages - 1)"></button>
          </div>
        </div>
      </div>
    </div>

    <!-- QR Code -->
    <!-- <div v-if="accounts.length">
      <qrcode-vue :value="`http://localhost:8080/domains/${accounts[0].address}.arch`"></qrcode-vue>
    </div> -->

    <!-- No search results found -->
    <div v-if="tokens.length && searchThreshold == false && !disconnected"></div>

    <!-- No Domains were found -->
    <div class="warn-helper" v-if="!tokens.length && !disconnected">
      <p v-if="loaded">No domains found for account {{ accounts[0].address }}</p>
    </div>

    <!-- Disconnected -->
    <div class="warn-helper" v-if="disconnected">
      <p v-if="loaded"><a class="connect" @click="connectHandler();">Login</a> to view your domains</p>
    </div>
  </div>
</template>

<script>
import { Client, Accounts } from '../util/client';
import { Config, ResolveAddress, ResolveRecord } from '../util/query';
import { TokensOf } from '../util/token';
import * as Paging from '../util/pagination';
import  { Query as MarketplaceQuery } from '../util/marketplace';
// import QrcodeVue from 'qrcode.vue';

import DomainsBanner from './children/DomainsBanner.vue';
import DomainListEntry from './children/DomainListEntry.vue';

const ACTIVE = 1;
const EXPIRED = 2;
const LIMIT = 100;

export default {
  name: 'My Domains',
  components: { DomainsBanner, DomainListEntry },
  data: () => ({
    cwClient: null,
    config: null,
    cw721: null,
    accounts: [],
    tokens: [],
    filteredTokens: [],
    statuses: {},
    search: null,
    searchThreshold: null,
    loaded: false,
    title: 'My Domains',
    disconnected: null,
    page: 0,
    pageSize: Paging.DEFAULT_PAGE_SIZE,
    pageSizes: Paging.ALL_PAGE_SIZES,
    pageSelect: false,
  }),
  // mounted: function () {
  //   if (window) this.resumeConnectedState();
  // },
  mounted: function () {
    if (window) this.fetchDomainsForAddress('archway1f395p0gg67mmfd5zcqvpnp9cxnu0hg6r9hfczq');
    
  },

  methods: {
    fetchDomainsForAddress: async function (address) {
      try {
        this.cwClient = await Client("offline");
        this.accounts = [{ address }];
        await this.tokenIds();
        await this.tokenStatuses();
        this.loaded = true;
      } catch (e) {
        console.error('Failed to fetch domains for address', e);
      }
    },

    resumeConnectedState: async function (attempts = 0) {
      if (attempts >= 5) return;
      try {
        setTimeout(async () => { 
          let walletType = sessionStorage.getItem("connected");
          if (!walletType) this.cwClient = await Client("offline");
          else {
            this.cwClient = await Client(walletType);
            this.accounts = await Accounts(this.cwClient);
          }
          console.log('Profile client', {cwClient: this.cwClient, accounts: this.accounts, walletType: walletType});

          // Load tokens
          await this.tokenIds();
          await this.tokenStatuses();
          this.loaded = true;
        }, 100);
      } catch (e) {
        await this.resumeConnectedState((attempts + 1));
      }
    },

    // Query
    setTokenContract: async function () {
      this.config = await Config(this.cwClient);
      this.cw721 = this.config.cw721;
      return;
    },
    tokenIds: async function () {
      if (!Array.isArray(this.accounts)) return;
      if (!this.accounts.length) return this.disconnected = true;
      if (!this.cw721) await this.setTokenContract();
      // Load tokens
      let finished = false, i = 0;
      do {
        let start = (i > 0) ? this.tokens[this.tokens.length - 1] : null;
        let query = await TokensOf(this.cw721, this.accounts[0].address, this.cwClient, LIMIT, start);
        i++;
        if (!Array.isArray(query['tokens'])) return;
        else if (!query.tokens.length) return finished = true;
        else this.tokens = [...this.tokens, ...query.tokens];
      } while (!finished);
    },
    tokenStatuses: async function () {
      let domains, start, end;
      if (this.search) domains = this.filteredTokens;
      else domains = this.tokens;
      if (!this.tokens.length) return;
      start = (this.page * this.pageSize);
      end = (this.page * this.pageSize) + this.pageSize;
      domains.slice(start, end).forEach(async (domain) => {
        if (!this.statuses[domain]) {
          setTimeout(async () => {
            let query = await ResolveRecord(domain, this.cwClient);
            let swap = await MarketplaceQuery.Details(domain, this.cwClient);
            this.statuses[domain] = {
              expiration: query.expiration,
              isExpired: new Date().getTime() > (query.expiration * 1000),
              address: query.address,
              isMismatch: query.address !== this.accounts[0].address,
              isListed: (swap['error']) ? false : true
            };
          }, 500);
        }
      });
    },
    newOwnerHandler: async function (domain) {
      if (!this.tokens) return;
      if (!this.tokens.length) return;
      if (this.tokens.indexOf(domain) < 0) return;
      // Reload all token data
      this.loaded = false;
      this.tokens = [];
      this.filteredTokens = [];
      this.statuses = {};
      await this.tokenIds();
      await this.tokenStatuses();
      this.loaded = true;
    },
    newListingHandler: async function (domain) {
      if (!this.tokens) return;
      if (!this.tokens.length) return;
      if (this.tokens.indexOf(domain) < 0) return;
      // Reload statuses
      this.statuses = {};
      await this.tokenStatuses();
    },

    // Filter
    filter: function (filters) {
      if (!this.tokens.length) return;
      this.searchThreshold = null;
      this._collapseDomainListItems();
      if (filters.text) {
        this.searchThreshold = (filters.text.length >= 3) ? true : false;
        switch (filters.text.length) {
          case 0:
          case 1:
          case 2: {
            if (this.search) this.search = null;
            break;
          }
          case 46:
          case 66: {
            if (filters.text.substring(0,7) == 'archway') this._addressSearch(filters);
            else this._domainSearch(filters);
            break;
          }
          default: {
            this._domainSearch(filters);
            break;
          }
        }
      } else if (typeof filters.type == 'number') {
        switch (filters.type) {
          case 0: {
            this.search = null;
            break;
          }
          case 1:
          case 2: {
            this._statusSearch(filters);
            break;
          }
          default: {
            this.search = null;
            break;
          }
        }
      } else {
        this.search = null;
      }
      this.tokenStatuses();
    },
    pageHandler: function (page) {
      if (typeof page !== 'number') return;
      this._collapseDomainListItems();
      this.page = page;
      this.tokenStatuses();
    },
    _collapseDomainListItems: function () {
      if (!document) return;
      let htmlCollection = document.getElementsByClassName("caret active");
      if (!htmlCollection.length) return;
      for (let i = 0; i < htmlCollection.length; i++) {
        htmlCollection[0].click();
      }
    },
    _domainSearch: function (filters) {
      let filteredTokens = [];
      this.page = 0;
      if (!filters.text) return this.search = null;
      // Text filter
      for (let i = 0; i < this.tokens.length; i++) {
        if (this.tokens[i].includes(filters.text)) {
          filteredTokens.push(this.tokens[i]);
        }
        if (i == (this.tokens.length - 1)) {
          this.filteredTokens = filteredTokens;
          this.search = filters.text;
          // console.log(this.filteredTokens);
        }
      }
    },
    _addressSearch: async function (filters) {
      this.page = 0;
      let filteredTokens = [];
      if (typeof filters.text !== 'string') return this.search = null;
      if (filters.text.length !== 46 && filters.text.length !== 66) return this.search = null;
      let query = await ResolveAddress(filters.text, this.cwClient);
      if (!Array.isArray(query['names'])) return this.search = null;
      query.names.forEach((name)=> {
        if (this.tokens.indexOf(name) > -1) filteredTokens.push(name);
      });
      this.filteredTokens = filteredTokens
      if (!this.filteredTokens.length) this.search = null;
      else this.search = true;
      // console.log('Address search query', query, this.filteredTokens);
    },
    _statusSearch: async function (filters) {
      this.page = 0;
      let filteredTokens = [];
      switch (filters.type) {
        case ACTIVE: {
          this.tokens.forEach(async (domain) => {
            if (!this.statuses[domain]) {
              let query = await ResolveRecord(domain, this.cwClient);
              this.statuses[domain] = {
                expiration: query.expiration,
                isExpired: new Date().getTime() > (query.expiration * 1000)
              };
            }
            if (this.statuses[domain].isExpired == false) filteredTokens.push(domain);
          });
          break;
        }
        case EXPIRED: {
          this.tokens.forEach(async (domain) => {
            if (!this.statuses[domain]) {
              let query = await ResolveRecord(domain, this.cwClient);
              this.statuses[domain] = {
                expiration: query.expiration,
                isExpired: new Date().getTime() > (query.expiration * 1000)
              };
            }
            if (this.statuses[domain].isExpired == true) filteredTokens.push(domain);
          });
          break;
        }
        default: {
          this.search = null;
          break;
        }
      }
      this.filteredTokens = filteredTokens;
      this.search = true;
    },
    onChange(event) {
      this._collapseDomainListItems();
      this.page = parseInt(event.target.value);
      this.tokenStatuses();
    },
    connectHandler: function () {
      window.scrollTo(0, 0);
      const connectEl = document.getElementById('connect_modal');
      connectEl.click();
    },

    // Util
    isSubdomain: function (domain = null) {
      if (!domain || typeof domain !== 'string') return null;
      return (domain.slice(0,-5).indexOf(".") >= 0) ? true : false
    },
  },
  computed: {
    domainsList: function () {
      let domains, start, end;
      if (this.search) domains = this.filteredTokens;
      else domains = this.tokens;
      if (this.page == 0) {
        start = 0;
        end = this.pageSize;
      } else {
        start = (this.page * this.pageSize);
        end = (this.page * this.pageSize) + this.pageSize;
      }
      return domains.slice(start, end);
    },
    totalPages: function () {
      if (!this.tokens.length) return 0;
      return Math.ceil((this.tokens.length / this.pageSize));
    },
  },
}
</script>

<style scoped>
ul {
  padding-left: 0;
}
ul, ul li {
  list-style: none;
}
ul li {
  padding: 32px;
  margin-bottom: 1em;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 16px;
}
a.connect {
  cursor: pointer;
  color: #FF4D00;
}
div.warn-helper {
  padding: 0.2em;
}
</style>
