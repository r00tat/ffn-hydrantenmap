terraform {
  backend "gcs" {
    bucket = "ffn-utils-tfstate"
    prefix = "cloudrun/hydrantenmap/project/ffn-utils"
  }
}
