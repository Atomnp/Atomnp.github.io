import os
import shutil


def copy_markdown_files(src_folder, dest_folder):
    # Ensure the destination folder exists
    os.makedirs(dest_folder, exist_ok=True)

    # Iterate over all files in the source folder
    for filename in os.listdir(src_folder):
        if filename.endswith(".md"):
            src_file_path = os.path.join(src_folder, filename)
            # Create a new folder named after the Markdown file (without the .md extension)
            folder_name = os.path.splitext(filename)[0]
            dest_folder_path = os.path.join(dest_folder, folder_name)
            os.makedirs(dest_folder_path, exist_ok=True)

            # Define the path for the index.md file inside the new folder
            dest_file_path = os.path.join(dest_folder_path, "index.md")

            # Copy the content of the Markdown file to the index.md file in the new folder
            shutil.copy(src_file_path, dest_file_path)
            print(f"Copied {filename} to {dest_file_path}")


# Example usage
src_folder = "/home/atom/work/personal_website/atomnp.github.io/_posts/"  # Replace with your source folder path
dest_folder = "/home/atom/work/alanlivio.github.io/content/posts"  # Replace with your destination folder path

copy_markdown_files(src_folder, dest_folder)
