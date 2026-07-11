import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
        policies: resolve(__dirname, "policies.html"),
        products: resolve(__dirname, "products.html"),
        makhana: resolve(__dirname, "makhana.html"),
        masala: resolve(__dirname, "masala.html"),
        poha: resolve(__dirname, "poha.html"),
        bundles: resolve(__dirname, "bundles.html"),
        slider: resolve(__dirname, "slider.html"),
        product: resolve(__dirname, "product.html"),
        account: resolve(__dirname, "account.html"),
        confirmation: resolve(__dirname, "confirmation.html"),
        track: resolve(__dirname, "track.html"),
        wholesale: resolve(__dirname, "wholesale.html"),
        internationalBuyerDesk: resolve(__dirname, "international-buyer-desk.html"),
        internationalBuyerCatalog: resolve(__dirname, "international-buyer-catalog.html"),
        bulkMakhana: resolve(__dirname, "bulk-makhana.html"),
        premiumRoastedMakhanaWholesale: resolve(__dirname, "premium-roasted-makhana-snack-packs-wholesale.html"),
        makhanaExporterIndia: resolve(__dirname, "makhana-exporter-india.html"),
        makhanaSupplierDubai: resolve(__dirname, "makhana-supplier-dubai.html"),
        makhanaDistributorDubaiUae: resolve(__dirname, "makhana-distributor-dubai-uae.html"),
        makhanaWholesaleUsa: resolve(__dirname, "makhana-wholesale-usa.html"),
        makhanaDistributorUk: resolve(__dirname, "makhana-distributor-uk.html"),
        companyStrength: resolve(__dirname, "company-strength.html"),
        suryaKantJhaChairmanProfile: resolve(__dirname, "surya-kant-jha-chairman-net-worth-travel-agent.html"),
        makhanaExportCompanyProof: resolve(__dirname, "makhana-export-company-net-worth-staff-offices.html"),
        directorySubmissionKit: resolve(__dirname, "directory-submission-kit.html"),
        marketplaceProductListingPack: resolve(__dirname, "marketplace-product-listing-pack.html"),
        officeNetwork: resolve(__dirname, "office-network.html"),
        companyProfile: resolve(__dirname, "company-profile.html"),
        proofCenter: resolve(__dirname, "proof-center.html"),
        about: resolve(__dirname, "about.html"),
        updates: resolve(__dirname, "updates.html"),
        dubai: resolve(__dirname, "dubai.html"),
        india: resolve(__dirname, "india.html"),
        uk: resolve(__dirname, "uk.html"),
        us: resolve(__dirname, "us.html")
      }
    }
  }
});
