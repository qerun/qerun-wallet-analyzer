const isVitest = Boolean(process.env.VITEST);

const config = {
  plugins: isVitest ? [] : ["@tailwindcss/postcss"],
};

export default config;
